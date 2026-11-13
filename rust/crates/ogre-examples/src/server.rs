//! The server a teacher can keep their examples on, in place of the
//! computer they grade on.
//!
//! It speaks plain HTTP and is meant to listen on its own computer only,
//! with a web server that speaks HTTPS in front of it. Every request must
//! carry the key.
//!
//! | Request | Answer |
//! |---|---|
//! | `GET /v1/examples` | `{"examples": 12}`: how many are kept |
//! | `DELETE /v1/examples` | `{"deleted": 12}`: all of them are gone |
//! | `GET /v1/examples/<rubric>` | the rubric's examples, as a list |
//! | `POST /v1/examples/<rubric>` | keeps the list sent; `{"kept": 3}` |

use std::io::Read;
use std::net::SocketAddr;
use std::sync::Arc;
use std::thread::JoinHandle;

use serde_json::{Value, json};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::{FolderStore, GradedExample, MAX_PER_RUBRIC, is_rubric_id};

/// The largest request taken, in bytes: room for a class of examples.
pub const MAX_BODY: usize = 512 * 1024;

/// The shortest key the server will run with.
pub const MIN_KEY_CHARS: usize = 24;

const PATH: &str = "/v1/examples";

/// A server that is listening.
pub struct Listening {
    /// The address it listens on, with the port it was given.
    pub address: SocketAddr,
    /// The threads that answer. They run for as long as the program does.
    pub threads: Vec<JoinHandle<()>>,
}

/// Starts a server on `address` that keeps its examples in `folder` and
/// asks for `key`. Port 0 takes any free port.
pub fn listen(
    address: SocketAddr,
    folder: impl Into<std::path::PathBuf>,
    key: &str,
    threads: usize,
) -> Result<Listening, String> {
    let server =
        Server::http(address).map_err(|error| format!("cannot listen on {address}: {error}"))?;
    let address = server
        .server_addr()
        .to_ip()
        .ok_or("the server is not listening on a network address")?;
    let threads = serve(
        Arc::new(server),
        Arc::new(FolderStore::new(folder)),
        key.into(),
        threads,
    );
    Ok(Listening { address, threads })
}

/// Answers requests on `server` from `threads` threads until the server is
/// dropped or unblocked.
pub fn serve(
    server: Arc<Server>,
    store: Arc<FolderStore>,
    key: Arc<str>,
    threads: usize,
) -> Vec<JoinHandle<()>> {
    (0..threads.max(1))
        .map(|_| {
            let (server, store, key) = (server.clone(), store.clone(), key.clone());
            std::thread::spawn(move || {
                while let Ok(request) = server.recv() {
                    handle(request, &store, &key);
                }
            })
        })
        .collect()
}

fn handle(mut request: Request, store: &FolderStore, key: &str) {
    let authorized = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Authorization"))
        .is_some_and(|header| carries_key(header.value.as_str(), key));
    let (status, body) = if !authorized {
        (401, json!({ "error": "The key is missing or wrong." }))
    } else {
        let mut sent = Vec::new();
        let read = request
            .as_reader()
            .take(MAX_BODY as u64 + 1)
            .read_to_end(&mut sent);
        match read {
            Ok(_) if sent.len() > MAX_BODY => (413, json!({ "error": "Too much at once." })),
            Ok(_) => answer(request.method(), request.url(), &sent, store),
            Err(_) => (400, json!({ "error": "The request was cut short." })),
        }
    };
    let json = Header::from_bytes("Content-Type", "application/json").expect("a valid header");
    let response = Response::from_string(body.to_string())
        .with_status_code(status)
        .with_header(json);
    // A client that went away has nothing to be told.
    let _ = request.respond(response);
}

/// True when the `Authorization` header is `Bearer` and the key. Every
/// character is compared, so the time taken says nothing about how much of
/// a wrong key was right.
fn carries_key(header: &str, key: &str) -> bool {
    let Some(sent) = header.strip_prefix("Bearer ") else {
        return false;
    };
    let (sent, key) = (sent.trim().as_bytes(), key.as_bytes());
    let mut differing = sent.len() ^ key.len();
    for at in 0..sent.len().max(key.len()) {
        let a = sent.get(at).copied().unwrap_or(0);
        let b = key.get(at).copied().unwrap_or(0);
        differing |= usize::from(a ^ b);
    }
    differing == 0
}

/// What a request that carried the key is answered with.
fn answer(method: &Method, url: &str, body: &[u8], store: &FolderStore) -> (u16, Value) {
    let path = url.split(['?', '#']).next().unwrap_or_default();
    let Some(rest) = path.strip_prefix(PATH) else {
        return (404, json!({ "error": "There is nothing at this address." }));
    };
    let failed = |problem: String| (500, json!({ "error": problem }));
    match (method, rest.strip_prefix('/')) {
        (Method::Get, None) if rest.is_empty() => match store.count() {
            Ok(examples) => (200, json!({ "examples": examples })),
            Err(problem) => failed(problem),
        },
        (Method::Delete, None) if rest.is_empty() => match store.clear() {
            Ok(deleted) => (200, json!({ "deleted": deleted })),
            Err(problem) => failed(problem),
        },
        (_, Some(rubric)) if !is_rubric_id(rubric) => (
            400,
            json!({ "error": "That is not the name of a rubric's examples." }),
        ),
        (Method::Get, Some(rubric)) => match store.for_rubric(rubric) {
            Ok(examples) => (200, json!(examples)),
            Err(problem) => failed(problem),
        },
        (Method::Post, Some(rubric)) => {
            let Ok(examples) = serde_json::from_slice::<Vec<GradedExample>>(body) else {
                return (400, json!({ "error": "A list of examples was expected." }));
            };
            if examples.len() > MAX_PER_RUBRIC {
                return (413, json!({ "error": "Too many examples at once." }));
            }
            match store.add(rubric, &examples) {
                Ok(kept) => (200, json!({ "kept": kept })),
                Err(problem) => failed(problem),
            }
        }
        _ => (405, json!({ "error": "That cannot be done here." })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_whole_key_opens_the_door() {
        let key = "a-key-of-a-decent-length-0123";
        assert!(carries_key(&format!("Bearer {key}"), key));
        assert!(!carries_key(key, key), "the word Bearer is part of it");
        assert!(!carries_key(&format!("Bearer {key}x"), key));
        assert!(!carries_key(
            &format!("Bearer {}", &key[..key.len() - 1]),
            key
        ));
        assert!(!carries_key("Bearer ", key));
        assert!(!carries_key("Basic abc", key));
    }
}
