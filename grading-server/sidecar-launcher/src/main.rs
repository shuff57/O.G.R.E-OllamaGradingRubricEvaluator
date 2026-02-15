use std::env;
use std::process::{Command, Stdio};
use std::path::PathBuf;

fn main() {
    // Get the directory where this executable is located
    let exe_path = env::current_exe().expect("Failed to get executable path");
    let exe_dir = exe_path.parent().expect("Failed to get executable directory");

    // Change to the grading-server directory
    let server_dir = exe_dir.join("server-bundle");
    env::set_current_dir(&server_dir).expect("Failed to change to server directory");

    // Spawn Bun to run server.js
    let mut child = Command::new("bun")
        .arg("run")
        .arg("server.js")
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("Failed to start grading server with Bun");

    // Wait for the server to exit
    let status = child.wait().expect("Failed to wait for child process");

    // Exit with the same code as the child
    std::process::exit(status.code().unwrap_or(1));
}
