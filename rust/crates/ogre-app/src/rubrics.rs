//! The teacher's saved rubrics, one JSON file each under `rubrics/` in the
//! app's data folder.
//!
//! A saved rubric is what the rubric card holds: the requirements and
//! exemplar answer as text, the teacher's instructions to the grader and the
//! scoring examples. It is for pages that carry no rubric OGRE can read, and
//! for a rubric the teacher has reworked and wants again.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// A rubric kept under a name.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct SavedRubric {
    pub name: String,
    /// Requirements and exemplar answer, as in the rubric editor.
    pub text: String,
    pub instructions: String,
    pub examples: String,
}

pub struct RubricStore {
    dir: PathBuf,
    rubrics: Vec<SavedRubric>,
}

impl RubricStore {
    /// Loads every readable rubric in the folder. A file that cannot be read
    /// is left alone and skipped.
    pub fn open(data_dir: PathBuf) -> Self {
        let dir = data_dir.join("rubrics");
        let mut rubrics: Vec<SavedRubric> = std::fs::read_dir(&dir)
            .into_iter()
            .flatten()
            .flatten()
            .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
            .filter_map(|entry| std::fs::read_to_string(entry.path()).ok())
            .filter_map(|json| serde_json::from_str::<SavedRubric>(&json).ok())
            .filter(|rubric| !rubric.name.trim().is_empty())
            .collect();
        sort(&mut rubrics);
        Self { dir, rubrics }
    }

    /// Every saved rubric, by name.
    pub fn all(&self) -> Vec<SavedRubric> {
        self.rubrics.clone()
    }

    /// Stores `rubric`, replacing the one of the same name.
    pub fn save(&mut self, rubric: SavedRubric) -> Result<(), String> {
        self.save_over(None, rubric)
    }

    /// Saves `rubric`. `was` is a rubric it takes the place of, whose file
    /// it may therefore take as well.
    fn save_over(&mut self, was: Option<&str>, mut rubric: SavedRubric) -> Result<(), String> {
        rubric.name = rubric.name.trim().to_owned();
        if rubric.name.is_empty() {
            return Err("Give the rubric a name to save it under.".into());
        }
        let json = serde_json::to_string_pretty(&rubric).map_err(|error| error.to_string())?;
        let file = self.file(&rubric.name);
        // Two names can come out as one file name. The file belongs to the
        // rubric that is in it.
        let taken = self
            .rubrics
            .iter()
            .filter(|other| Some(other.name.as_str()) != was)
            .any(|other| other.name != rubric.name && self.file(&other.name) == file);
        if taken {
            return Err(format!(
                "\"{}\" is too close to the name of another saved rubric. Choose a different name.",
                rubric.name
            ));
        }
        std::fs::create_dir_all(&self.dir).map_err(|error| error.to_string())?;
        std::fs::write(file, json).map_err(|error| error.to_string())?;
        self.rubrics.retain(|other| other.name != rubric.name);
        self.rubrics.push(rubric);
        sort(&mut self.rubrics);
        Ok(())
    }

    /// Stores a rubric written or changed in the library. `was` is the name
    /// it had, if it was saved before: under a new name the old one goes.
    /// Unlike [`Self::save`], never over another rubric: its name has to be
    /// its own.
    pub fn put(&mut self, was: Option<&str>, rubric: SavedRubric) -> Result<(), String> {
        let name = rubric.name.trim().to_owned();
        if was != Some(name.as_str()) && self.rubrics.iter().any(|other| other.name == name) {
            return Err(format!(
                "There is already a saved rubric called \u{201c}{name}\u{201d}. Choose another name."
            ));
        }
        let renamed = was.filter(|was| *was != name);
        // A new name that makes the same file, as "essay 2" does after
        // "Essay 2": the file is written over, and must not then be deleted.
        let same_file = renamed.is_some_and(|was| self.file(was) == self.file(&name));
        self.save_over(was, rubric)?;
        match renamed {
            Some(was) if same_file => {
                self.rubrics.retain(|rubric| rubric.name != was);
                Ok(())
            }
            Some(was) => self.delete(was),
            None => Ok(()),
        }
    }

    pub fn delete(&mut self, name: &str) -> Result<(), String> {
        match std::fs::remove_file(self.file(name)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        self.rubrics.retain(|rubric| rubric.name != name);
        Ok(())
    }

    /// The file for a rubric. Names are the teacher's own words, so anything
    /// that is not plainly safe in a file name is replaced.
    fn file(&self, name: &str) -> PathBuf {
        let safe: String = name
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' {
                    c.to_lowercase().next().unwrap_or('_')
                } else {
                    '_'
                }
            })
            .collect();
        self.dir.join(format!("{safe}.json"))
    }
}

fn sort(rubrics: &mut [SavedRubric]) {
    rubrics.sort_by_key(|rubric| rubric.name.to_lowercase());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rubric(name: &str, text: &str) -> SavedRubric {
        SavedRubric {
            name: name.to_owned(),
            text: text.to_owned(),
            instructions: "Accept answers in words.".to_owned(),
            examples: String::new(),
        }
    }

    fn scratch(test: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ogre-rubrics-{test}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn names(store: &RubricStore) -> Vec<String> {
        store.all().into_iter().map(|rubric| rubric.name).collect()
    }

    #[test]
    fn a_rubric_can_be_renamed_to_a_name_that_makes_the_same_file() {
        let dir = scratch("same-file");
        let mut store = RubricStore::open(dir.clone());
        store.save(rubric("Essay 2", "## Thesis")).unwrap();
        store.save(rubric("Quiz 1", "## Units")).unwrap();

        // Only the capitals change: the same file, and no other rubric's.
        store
            .put(Some("Essay 2"), rubric("essay 2", "## Thesis"))
            .unwrap();
        assert_eq!(names(&store), ["essay 2", "Quiz 1"]);
        let reopened = RubricStore::open(dir.clone());
        assert_eq!(names(&reopened), ["essay 2", "Quiz 1"]);

        // Another rubric's file is still not to be had.
        let taken = store.put(Some("essay 2"), rubric("quiz 1", "## Thesis"));
        assert!(taken.is_err(), "{taken:?}");
        assert_eq!(names(&store), ["essay 2", "Quiz 1"]);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn rubrics_survive_a_restart_and_can_be_removed() {
        let dir = scratch("roundtrip");
        let mut store = RubricStore::open(dir.clone());
        assert!(store.all().is_empty());
        store
            .save(rubric("essay 2", "## Thesis\nStates a position"))
            .unwrap();
        store
            .save(rubric("  Binomial FRQ ", "Names n and p"))
            .unwrap();

        let mut reopened = RubricStore::open(dir.clone());
        assert_eq!(names(&reopened), ["Binomial FRQ", "essay 2"]);
        assert_eq!(
            reopened.all()[1],
            rubric("essay 2", "## Thesis\nStates a position")
        );

        reopened.delete("essay 2").unwrap();
        reopened.delete("never saved").unwrap();
        assert_eq!(names(&RubricStore::open(dir.clone())), ["Binomial FRQ"]);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_library_renames_a_rubric_and_never_writes_over_another() {
        let dir = scratch("put");
        let mut store = RubricStore::open(dir.clone());
        store.put(None, rubric("Essay 2", "first")).unwrap();
        store.put(None, rubric("Binomial FRQ", "other")).unwrap();

        // Changed under its own name, then under a new one: the old goes.
        store
            .put(Some("Essay 2"), rubric("Essay 2", "second"))
            .unwrap();
        store
            .put(Some("Essay 2"), rubric("Essay 3", "third"))
            .unwrap();
        assert_eq!(names(&store), ["Binomial FRQ", "Essay 3"]);
        assert_eq!(
            names(&RubricStore::open(dir.clone())),
            ["Binomial FRQ", "Essay 3"]
        );

        // Neither a new rubric nor a renamed one takes another's name.
        for was in [None, Some("Essay 3")] {
            let clash = store.put(was, rubric("Binomial FRQ", "mine")).unwrap_err();
            assert!(clash.contains("already a saved rubric"), "{clash}");
        }
        assert_eq!(store.all()[0].text, "other");
        assert_eq!(names(&store), ["Binomial FRQ", "Essay 3"]);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn saving_under_the_same_name_replaces() {
        let dir = scratch("replace");
        let mut store = RubricStore::open(dir.clone());
        store.save(rubric("Essay 2", "first")).unwrap();
        store.save(rubric("Essay 2", "second")).unwrap();
        assert_eq!(store.all().len(), 1);
        assert_eq!(RubricStore::open(dir.clone()).all()[0].text, "second");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_rubric_needs_a_name_of_its_own() {
        let dir = scratch("names");
        let mut store = RubricStore::open(dir.clone());
        assert!(store.save(rubric("   ", "text")).is_err());
        store.save(rubric("Essay 2", "kept")).unwrap();
        // Would land in the same file and silently replace the other.
        let clash = store.save(rubric("essay/2", "other")).unwrap_err();
        assert!(clash.contains("too close to the name"), "{clash}");
        assert_eq!(store.all().len(), 1);
        assert_eq!(RubricStore::open(dir.clone()).all()[0].text, "kept");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn odd_names_stay_inside_the_folder_and_bad_files_are_skipped() {
        let dir = scratch("odd");
        let mut store = RubricStore::open(dir.clone());
        store.save(rubric("../../evil", "text")).unwrap();
        std::fs::write(dir.join("rubrics/broken.json"), "{ not json").unwrap();
        std::fs::write(dir.join("rubrics/nameless.json"), "{}").unwrap();
        let mut files: Vec<_> = std::fs::read_dir(dir.join("rubrics"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        files.sort();
        assert_eq!(files, ["______evil.json", "broken.json", "nameless.json"]);
        assert_eq!(names(&RubricStore::open(dir.clone())), ["../../evil"]);
        let _ = std::fs::remove_dir_all(dir);
    }
}
