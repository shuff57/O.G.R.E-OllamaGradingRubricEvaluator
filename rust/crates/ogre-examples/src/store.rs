//! Examples in a folder: one file per rubric, one example per line.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::{GradedExample, MAX_PER_RUBRIC, is_rubric_id};

/// A folder of examples. The folder and its files are readable by their
/// owner only.
pub struct FolderStore {
    dir: PathBuf,
    /// One change at a time: a file is read, added to and replaced.
    changing: Mutex<()>,
}

impl FolderStore {
    /// Nothing is created until the first example is kept.
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self {
            dir: dir.into(),
            changing: Mutex::new(()),
        }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Keeps `examples` for the rubric named `rubric`, beside those already
    /// there. Gives how many were kept: ones that say nothing are left out.
    pub fn add(&self, rubric: &str, examples: &[GradedExample]) -> Result<usize, String> {
        let file = self.file(rubric)?;
        let new: Vec<GradedExample> = examples.iter().filter_map(GradedExample::tidy).collect();
        if new.is_empty() {
            return Ok(0);
        }
        let _one_at_a_time = self.changing.lock().map_err(|e| e.to_string())?;
        let mut all = read(&file)?;
        all.extend(new.iter().cloned());
        let from = all.len().saturating_sub(MAX_PER_RUBRIC);
        self.replace(&file, &all[from..])?;
        Ok(new.len())
    }

    /// Every example kept for the rubric named `rubric`, oldest first.
    pub fn for_rubric(&self, rubric: &str) -> Result<Vec<GradedExample>, String> {
        read(&self.file(rubric)?)
    }

    /// How many examples are kept, for all rubrics together.
    pub fn count(&self) -> Result<usize, String> {
        let mut count = 0;
        for file in self.files()? {
            count += read(&file)?.len();
        }
        Ok(count)
    }

    /// Deletes every example. Gives how many there were. Nothing else in the
    /// folder is touched.
    pub fn clear(&self) -> Result<usize, String> {
        let _one_at_a_time = self.changing.lock().map_err(|e| e.to_string())?;
        let mut deleted = 0;
        for file in self.files()? {
            deleted += read(&file)?.len();
            fs::remove_file(&file).map_err(|e| problem("delete", &file, &e))?;
        }
        Ok(deleted)
    }

    fn file(&self, rubric: &str) -> Result<PathBuf, String> {
        if is_rubric_id(rubric) {
            Ok(self.dir.join(format!("{rubric}.jsonl")))
        } else {
            Err("That is not the name of a rubric's examples.".to_owned())
        }
    }

    /// The files in the folder that hold examples.
    fn files(&self) -> Result<Vec<PathBuf>, String> {
        let entries = match fs::read_dir(&self.dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(problem("read", &self.dir, &error)),
        };
        Ok(entries
            .filter_map(|entry| Some(entry.ok()?.path()))
            .filter(|path| {
                path.extension().is_some_and(|e| e == "jsonl")
                    && path
                        .file_stem()
                        .and_then(|stem| stem.to_str())
                        .is_some_and(is_rubric_id)
            })
            .collect())
    }

    /// Writes `examples` beside `file` and puts the result in its place, so
    /// that a write cut short leaves the file as it was.
    fn replace(&self, file: &Path, examples: &[GradedExample]) -> Result<(), String> {
        private_dir(&self.dir).map_err(|e| problem("create", &self.dir, &e))?;
        let mut text = String::new();
        for example in examples {
            text.push_str(&serde_json::to_string(example).map_err(|e| e.to_string())?);
            text.push('\n');
        }
        let beside = file.with_extension("writing");
        private_file(&beside)
            .and_then(|mut out| out.write_all(text.as_bytes()))
            .and_then(|()| fs::rename(&beside, file))
            .map_err(|e| problem("write", file, &e))
    }
}

/// The examples in `file`, or none if there is no such file. A line that
/// cannot be read is passed over: the rest are still good.
fn read(file: &Path) -> Result<Vec<GradedExample>, String> {
    match fs::read_to_string(file) {
        Ok(text) => Ok(text
            .lines()
            .filter_map(|line| serde_json::from_str::<GradedExample>(line).ok())
            .filter_map(|example| example.tidy())
            .collect()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(problem("read", file, &error)),
    }
}

fn problem(doing: &str, path: &Path, error: &std::io::Error) -> String {
    format!("Could not {doing} {}: {error}", path.display())
}

#[cfg(unix)]
fn private_dir(dir: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)
}

#[cfg(not(unix))]
fn private_dir(dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dir)
}

#[cfg(unix)]
fn private_file(file: &Path) -> std::io::Result<fs::File> {
    use std::os::unix::fs::OpenOptionsExt;
    fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(file)
}

#[cfg(not(unix))]
fn private_file(file: &Path) -> std::io::Result<fs::File> {
    fs::File::create(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A folder of its own for one test, removed when the test is over.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "ogre-examples-{name}-{}-{:?}",
                std::process::id(),
                std::thread::current().id()
            ));
            let _ = fs::remove_dir_all(&dir);
            Self(dir)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn example(score: f64, feedback: &str) -> GradedExample {
        GradedExample {
            score,
            max_score: 10.0,
            feedback: feedback.to_owned(),
            changed: false,
            at: 7,
        }
    }

    const ONE: &str = "1111111111111111111111111111111111111111111111111111111111111111";
    const TWO: &str = "2222222222222222222222222222222222222222222222222222222222222222";

    #[test]
    fn examples_are_kept_by_rubric_and_read_back() {
        let scratch = Scratch::new("kept");
        let store = FolderStore::new(scratch.0.join("examples"));
        assert_eq!(store.count(), Ok(0), "no folder yet is no examples");
        assert_eq!(store.for_rubric(ONE), Ok(vec![]));

        let first = [example(6.0, "Name the standard error."), example(0.0, " ")];
        assert_eq!(store.add(ONE, &first), Ok(1), "one of them says nothing");
        assert_eq!(store.add(ONE, &[example(9.0, "Clear.")]), Ok(1));
        assert_eq!(store.add(TWO, &[example(3.0, "Too short.")]), Ok(1));

        let kept = store.for_rubric(ONE).unwrap();
        let scores: Vec<f64> = kept.iter().map(|e| e.score).collect();
        assert_eq!(scores, [6.0, 9.0]);
        assert_eq!(kept[0].feedback, "Name the standard error.");
        assert_eq!(store.count(), Ok(3));
        assert_eq!(
            FolderStore::new(store.dir()).count(),
            Ok(3),
            "they are on disk"
        );
    }

    #[test]
    fn only_the_newest_are_kept_for_a_rubric() {
        let scratch = Scratch::new("newest");
        let store = FolderStore::new(&scratch.0);
        let many: Vec<_> = (0..MAX_PER_RUBRIC + 5)
            .map(|n| example(5.0, &format!("Number {n}.")))
            .collect();
        store.add(ONE, &many).unwrap();
        let kept = store.for_rubric(ONE).unwrap();
        assert_eq!(kept.len(), MAX_PER_RUBRIC);
        assert_eq!(kept[0].feedback, "Number 5.");
    }

    #[test]
    fn deleting_takes_the_examples_and_nothing_else() {
        let scratch = Scratch::new("deleted");
        let store = FolderStore::new(&scratch.0);
        store
            .add(ONE, &[example(6.0, "a"), example(7.0, "b")])
            .unwrap();
        store.add(TWO, &[example(8.0, "c")]).unwrap();
        let other = scratch.0.join("notes.txt");
        fs::write(&other, "not an example").unwrap();

        assert_eq!(store.clear(), Ok(3));
        assert_eq!(store.count(), Ok(0));
        assert!(other.exists());
        assert_eq!(store.clear(), Ok(0));
    }

    #[test]
    fn a_name_that_is_not_a_rubrics_is_refused() {
        let scratch = Scratch::new("refused");
        let store = FolderStore::new(&scratch.0);
        for name in ["../outside", "", "abc", &"g".repeat(64)] {
            assert!(store.add(name, &[example(6.0, "a")]).is_err(), "{name}");
            assert!(store.for_rubric(name).is_err(), "{name}");
        }
        assert!(!scratch.0.exists(), "nothing was written");
    }

    #[test]
    fn a_damaged_line_does_not_lose_the_rest() {
        let scratch = Scratch::new("damaged");
        let store = FolderStore::new(&scratch.0);
        store
            .add(ONE, &[example(6.0, "a"), example(7.0, "b")])
            .unwrap();
        let file = scratch.0.join(format!("{ONE}.jsonl"));
        let text = fs::read_to_string(&file).unwrap();
        fs::write(&file, format!("{{half a line\n{text}")).unwrap();
        assert_eq!(store.for_rubric(ONE).unwrap().len(), 2);
    }

    #[cfg(unix)]
    #[test]
    fn the_folder_and_its_files_are_the_owners_alone() {
        use std::os::unix::fs::PermissionsExt;
        let scratch = Scratch::new("private");
        let store = FolderStore::new(scratch.0.join("examples"));
        store.add(ONE, &[example(6.0, "a")]).unwrap();
        let mode = |path: &Path| fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(store.dir()), 0o700);
        assert_eq!(mode(&store.dir().join(format!("{ONE}.jsonl"))), 0o600);
    }
}
