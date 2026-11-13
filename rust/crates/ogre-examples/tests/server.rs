//! The server and its client, talking over a real connection on this
//! computer.

use std::path::PathBuf;

use ogre_examples::server::{MAX_BODY, listen};
use ogre_examples::{FolderStore, GradedExample, MAX_PER_RUBRIC, ServerStore, rubric_id};

const KEY: &str = "the-key-of-a-test-0123456789";

/// A server on a free port with a folder of its own. The folder goes when
/// the test is over.
struct Running {
    address: String,
    folder: PathBuf,
}

impl Running {
    fn start(name: &str) -> Self {
        let folder = std::env::temp_dir().join(format!(
            "ogre-examples-server-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&folder);
        let listening =
            listen("127.0.0.1:0".parse().unwrap(), &folder, KEY, 2).expect("a free port");
        let address = format!("http://{}", listening.address);
        Self { address, folder }
    }

    fn store(&self) -> ServerStore {
        ServerStore::new(&self.address, KEY).unwrap()
    }
}

impl Drop for Running {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.folder);
    }
}

fn example(score: f64, feedback: &str) -> GradedExample {
    GradedExample {
        score,
        max_score: 10.0,
        feedback: feedback.to_owned(),
        changed: score < 5.0,
        at: 1_700_000_000,
    }
}

fn question(text: &str) -> String {
    rubric_id(text, "", 10.0).unwrap()
}

#[tokio::test]
async fn examples_go_to_the_server_and_come_back() {
    let running = Running::start("round-trip");
    let store = running.store();
    assert_eq!(store.count().await, Ok(0));

    let standard_error = question("Explain the standard error.");
    let sent = [
        example(6.0, "Name the standard error."),
        example(2.0, "Only a conclusion."),
        example(9.0, " "),
    ];
    assert_eq!(store.add(&standard_error, &sent).await, Ok(2));
    assert_eq!(
        store
            .add(&question("What is a p-value?"), &[example(8.0, "Clear.")])
            .await,
        Ok(1)
    );

    let back = store.for_rubric(&standard_error).await.unwrap();
    assert_eq!(back, sent[..2]);
    assert_eq!(
        store.for_rubric(&question("Never graded.")).await,
        Ok(vec![])
    );
    assert_eq!(store.count().await, Ok(3));

    // They are on the server's disk, not in its memory.
    assert_eq!(FolderStore::new(&running.folder).count(), Ok(3));

    assert_eq!(store.clear().await, Ok(3));
    assert_eq!(store.count().await, Ok(0));
}

#[tokio::test]
async fn nothing_is_done_without_the_key() {
    let running = Running::start("no-key");
    let rubric = question("Explain the standard error.");
    running
        .store()
        .add(&rubric, &[example(6.0, "Kept.")])
        .await
        .unwrap();

    let stranger = ServerStore::new(&running.address, "not-the-key-0123456789abcd").unwrap();
    for refused in [
        stranger.count().await.map(|_| ()),
        stranger.for_rubric(&rubric).await.map(|_| ()),
        stranger
            .add(&rubric, &[example(1.0, "Planted.")])
            .await
            .map(|_| ()),
        stranger.clear().await.map(|_| ()),
    ] {
        assert_eq!(
            refused,
            Err("The examples server did not accept the key.".to_owned())
        );
    }
    assert_eq!(running.store().count().await, Ok(1), "nothing was changed");
}

#[tokio::test]
async fn what_the_server_cannot_take_is_refused() {
    let running = Running::start("refused");
    let store = running.store();
    let rubric = question("Explain the standard error.");

    let too_many: Vec<_> = (0..MAX_PER_RUBRIC + 1)
        .map(|n| example(5.0, &format!("Number {n}.")))
        .collect();
    let refused = store.add(&rubric, &too_many).await.unwrap_err();
    assert!(refused.contains("413"), "{refused}");

    let huge = [example(5.0, &"x".repeat(MAX_BODY + 10))];
    assert!(store.add(&rubric, &huge).await.is_err());

    assert!(store.for_rubric("../../etc/passwd").await.is_err());
    assert_eq!(store.count().await, Ok(0));
}

#[tokio::test]
async fn a_server_that_is_not_there_is_said_to_be_unreachable() {
    // A port nothing listens on: bound, looked at, and let go.
    let port = {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.local_addr().unwrap().port()
    };
    let store = ServerStore::new(&format!("http://127.0.0.1:{port}"), KEY).unwrap();
    assert_eq!(
        store.count().await,
        Err("The examples server at 127.0.0.1 could not be reached.".to_owned())
    );
}

#[tokio::test]
async fn another_kind_of_server_is_not_taken_for_this_one() {
    // The server is there, but OGRE was pointed at a folder it does not have.
    let running = Running::start("elsewhere");
    let store = ServerStore::new(&format!("{}/somewhere-else", running.address), KEY).unwrap();
    let problem = store.count().await.unwrap_err();
    assert!(
        problem.contains("no examples server at that address"),
        "{problem}"
    );
}
