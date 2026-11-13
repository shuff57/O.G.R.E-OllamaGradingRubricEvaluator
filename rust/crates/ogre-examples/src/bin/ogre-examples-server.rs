//! Keeps a teacher's graded examples on this computer for OGRE to reach
//! from another one. See the crate's README for setting it up.

use std::io::Read;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use ogre_examples::server::{MIN_KEY_CHARS, listen};

const USAGE: &str = "\
Keeps OGRE's graded examples on this computer.

    ogre-examples-server --folder <folder> --key-file <file> [--listen <address>]

  --folder    where the examples are kept
  --key-file  a file holding the key OGRE must send. If there is no such
              file, one is made with a new key in it: copy that key into
              OGRE's Settings
  --listen    the address to listen on (default 127.0.0.1:8750)

The server speaks plain HTTP. Leave it listening on this computer only and
put a web server that speaks HTTPS in front of it: OGRE will not send the
key to another computer any other way.";

const DEFAULT_LISTEN: &str = "127.0.0.1:8750";

struct Options {
    folder: PathBuf,
    key_file: PathBuf,
    listen: SocketAddr,
}

fn main() -> ExitCode {
    let options = match options(std::env::args().skip(1)) {
        Ok(Some(options)) => options,
        Ok(None) => {
            println!("{USAGE}");
            return ExitCode::SUCCESS;
        }
        Err(problem) => {
            eprintln!("{problem}\n\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    match run(&options) {
        Ok(()) => ExitCode::SUCCESS,
        Err(problem) => {
            eprintln!("ogre-examples-server: {problem}");
            ExitCode::FAILURE
        }
    }
}

fn options(mut args: impl Iterator<Item = String>) -> Result<Option<Options>, String> {
    let (mut folder, mut key_file, mut listen) = (None, None, DEFAULT_LISTEN.to_owned());
    while let Some(arg) = args.next() {
        let mut value = || args.next().ok_or(format!("{arg} needs a value."));
        match arg.as_str() {
            "--help" | "-h" => return Ok(None),
            "--folder" => folder = Some(PathBuf::from(value()?)),
            "--key-file" => key_file = Some(PathBuf::from(value()?)),
            "--listen" => listen = value()?,
            other => return Err(format!("Unknown option {other}.")),
        }
    }
    Ok(Some(Options {
        folder: folder.ok_or("Say where to keep the examples with --folder.")?,
        key_file: key_file.ok_or("Say where the key is with --key-file.")?,
        listen: listen
            .parse()
            .map_err(|_| format!("{listen} is not an address to listen on."))?,
    }))
}

fn run(options: &Options) -> Result<(), String> {
    let key = key(&options.key_file)?;
    let listening = listen(options.listen, &options.folder, &key, 4)?;
    println!(
        "Keeping examples in {} and listening on {}.",
        options.folder.display(),
        options.listen
    );
    if !options.listen.ip().is_loopback() {
        println!(
            "Other computers can reach this address and nothing sent to it is encrypted. \
             OGRE will only use it through a web server that speaks HTTPS."
        );
    }
    for thread in listening.threads {
        let _ = thread.join();
    }
    Ok(())
}

/// The key in `file`. A file that is not there is made, with a new key.
/// The key itself is never printed.
fn key(file: &Path) -> Result<String, String> {
    if !file.exists() {
        write_new_key(file)?;
        println!(
            "A new key was written to {}. Copy it into OGRE's Settings.",
            file.display()
        );
    }
    let key = std::fs::read_to_string(file)
        .map_err(|error| format!("cannot read {}: {error}", file.display()))?
        .trim()
        .to_owned();
    if key.chars().count() < MIN_KEY_CHARS {
        return Err(format!(
            "the key in {} is shorter than {MIN_KEY_CHARS} characters. Delete the file to \
             have a new one made.",
            file.display()
        ));
    }
    Ok(key)
}

/// Writes 32 bytes from the system's random source, as hex, readable by the
/// owner alone.
fn write_new_key(file: &Path) -> Result<(), String> {
    let mut random = [0u8; 32];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut source| source.read_exact(&mut random))
        .map_err(|error| format!("cannot make a key: {error}"))?;
    let key: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
        .open(file)
        .and_then(|mut out| std::io::Write::write_all(&mut out, format!("{key}\n").as_bytes()))
        .map_err(|error| format!("cannot write {}: {error}", file.display()))
}
