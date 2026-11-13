//! Examples kept on a server: the other end of [`crate::server`].

use std::time::Duration;

use reqwest::{Method, StatusCode, Url};
use serde_json::Value;

use crate::{GradedExample, is_rubric_id};

/// How long the server is given to answer.
const PATIENCE: Duration = Duration::from_secs(15);

/// A server that keeps examples, and the key it asks for.
pub struct ServerStore {
    /// The address requests go to, ending in `/v1/examples`.
    examples: Url,
    key: String,
    http: reqwest::Client,
}

impl std::fmt::Debug for ServerStore {
    // The key is not for a log.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ServerStore({})", self.examples)
    }
}

impl ServerStore {
    /// `address` is where the server is, as the teacher typed it. It must
    /// be an `https://` address, so that neither the key nor any feedback
    /// crosses a network in the clear; `http://` is taken only for a server
    /// on this computer.
    pub fn new(address: &str, key: &str) -> Result<Self, String> {
        let (address, key) = (address.trim(), key.trim());
        if address.is_empty() {
            return Err("Enter the server\u{2019}s address.".to_owned());
        }
        if key.is_empty() {
            return Err("Enter the server\u{2019}s key.".to_owned());
        }
        let wrong = || format!("\u{201c}{address}\u{201d} is not an address OGRE can use.");
        let mut url = Url::parse(address).map_err(|_| wrong())?;
        let here = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
        match url.scheme() {
            "https" => {}
            "http" if here => {}
            "http" => {
                return Err(
                    "The server\u{2019}s address must start with https://, so that the key \
                     and the feedback are not sent in the clear."
                        .to_owned(),
                );
            }
            _ => return Err(wrong()),
        }
        if url.host_str().is_none() || url.cannot_be_a_base() {
            return Err(wrong());
        }
        url.set_query(None);
        url.set_fragment(None);
        let folder = url.path().trim_end_matches('/').to_owned();
        url.set_path(&format!("{folder}/v1/examples"));
        let http = reqwest::Client::builder()
            .timeout(PATIENCE)
            .build()
            .map_err(|error| format!("The connection could not be set up: {error}"))?;
        Ok(Self {
            examples: url,
            key: key.to_owned(),
            http,
        })
    }

    /// Keeps `examples` for the rubric named `rubric`. Gives how many the
    /// server kept.
    pub async fn add(&self, rubric: &str, examples: &[GradedExample]) -> Result<usize, String> {
        let body = serde_json::to_string(examples).map_err(|e| e.to_string())?;
        let answer = self.ask(Method::POST, Some(rubric), Some(body)).await?;
        number(&answer, "kept")
    }

    /// Every example the server keeps for the rubric named `rubric`.
    pub async fn for_rubric(&self, rubric: &str) -> Result<Vec<GradedExample>, String> {
        let answer = self.ask(Method::GET, Some(rubric), None).await?;
        serde_json::from_value(answer).map_err(|_| unexpected())
    }

    /// How many examples the server keeps.
    pub async fn count(&self) -> Result<usize, String> {
        number(&self.ask(Method::GET, None, None).await?, "examples")
    }

    /// Deletes every example on the server. Gives how many there were.
    pub async fn clear(&self) -> Result<usize, String> {
        number(&self.ask(Method::DELETE, None, None).await?, "deleted")
    }

    async fn ask(
        &self,
        method: Method,
        rubric: Option<&str>,
        body: Option<String>,
    ) -> Result<Value, String> {
        let mut url = self.examples.clone();
        if let Some(rubric) = rubric {
            if !is_rubric_id(rubric) {
                return Err("That is not the name of a rubric\u{2019}s examples.".to_owned());
            }
            url.set_path(&format!("{}/{rubric}", url.path()));
        }
        let host = url.host_str().unwrap_or_default().to_owned();
        let mut request = self.http.request(method, url).bearer_auth(&self.key);
        if let Some(body) = body {
            request = request
                .header("Content-Type", "application/json")
                .body(body);
        }
        let response = request.send().await.map_err(|error| {
            if error.is_timeout() {
                format!("The examples server at {host} did not answer in time.")
            } else {
                format!("The examples server at {host} could not be reached.")
            }
        })?;
        match response.status() {
            StatusCode::OK => {
                let text = response.text().await.map_err(|_| unexpected())?;
                serde_json::from_str(&text).map_err(|_| unexpected())
            }
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                Err("The examples server did not accept the key.".to_owned())
            }
            StatusCode::NOT_FOUND => Err(format!(
                "There is no examples server at that address on {host}."
            )),
            status => Err(format!(
                "The examples server answered with an error ({}).",
                status.as_u16()
            )),
        }
    }
}

fn number(answer: &Value, field: &str) -> Result<usize, String> {
    answer[field]
        .as_u64()
        .and_then(|n| usize::try_from(n).ok())
        .ok_or_else(unexpected)
}

fn unexpected() -> String {
    "The examples server gave an answer OGRE does not understand.".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn address_of(address: &str) -> Result<String, String> {
        ServerStore::new(address, "a-key").map(|store| store.examples.to_string())
    }

    #[test]
    fn the_address_is_taken_with_or_without_a_folder() {
        assert_eq!(
            address_of("https://school.example").as_deref(),
            Ok("https://school.example/v1/examples")
        );
        assert_eq!(
            address_of(" https://school.example/ogre/?x=1#top ").as_deref(),
            Ok("https://school.example/ogre/v1/examples")
        );
        assert_eq!(
            address_of("http://127.0.0.1:8750").as_deref(),
            Ok("http://127.0.0.1:8750/v1/examples")
        );
        assert!(address_of("http://localhost:8750").is_ok());
    }

    #[test]
    fn nothing_is_sent_in_the_clear_to_another_computer() {
        let refused = address_of("http://school.example").unwrap_err();
        assert!(refused.contains("https://"), "{refused}");
        assert!(address_of("http://192.168.1.20:8750").is_err());
        // A name that only starts like this computer's is another computer.
        assert!(address_of("http://localhost.example").is_err());
    }

    #[test]
    fn what_is_missing_or_is_no_address_is_said() {
        assert!(address_of("").unwrap_err().contains("address"));
        assert!(
            ServerStore::new("https://school.example", " ")
                .unwrap_err()
                .contains("key")
        );
        assert!(address_of("school.example").is_err());
        assert!(address_of("ftp://school.example").is_err());
    }

    #[test]
    fn the_key_stays_out_of_what_is_printed() {
        let store = ServerStore::new("https://school.example", "a-secret-key").unwrap();
        assert!(!format!("{store:?}").contains("a-secret-key"));
    }
}
