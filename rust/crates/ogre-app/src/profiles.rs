//! The teacher's own site mappings, one JSON file each under `profiles/` in
//! the app's data folder.

use std::path::PathBuf;

use ogre_harness::sites::generic::SiteProfile;

pub struct ProfileStore {
    dir: PathBuf,
    profiles: Vec<SiteProfile>,
}

/// A stored mapping, as the Sites screen lists it.
#[derive(Debug, Clone, PartialEq)]
pub struct ProfileSummary {
    pub id: String,
    pub name: String,
    /// The pages it applies to, such as `grades.example.edu/course/*/grade`.
    pub pages: String,
}

impl ProfileStore {
    /// Loads every readable mapping in the folder. A file that cannot be read
    /// is left alone and skipped.
    pub fn open(data_dir: PathBuf) -> Self {
        let dir = data_dir.join("profiles");
        let mut profiles: Vec<SiteProfile> = std::fs::read_dir(&dir)
            .into_iter()
            .flatten()
            .flatten()
            .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
            .filter_map(|entry| std::fs::read_to_string(entry.path()).ok())
            .filter_map(|json| SiteProfile::from_json(&json).ok())
            .collect();
        profiles.sort_by(|a, b| a.name.cmp(&b.name));
        Self { dir, profiles }
    }

    pub fn all(&self) -> &[SiteProfile] {
        &self.profiles
    }

    /// The mapping saved under `id`.
    pub fn get(&self, id: &str) -> Option<&SiteProfile> {
        self.profiles.iter().find(|profile| profile.id == id)
    }

    pub fn summaries(&self) -> Vec<ProfileSummary> {
        self.profiles
            .iter()
            .map(|profile| ProfileSummary {
                id: profile.id.clone(),
                name: profile.name.clone(),
                pages: format!("{}{}", profile.url.host, profile.url.path),
            })
            .collect()
    }

    /// Stores `profile`, replacing one with the same id.
    pub fn save(&mut self, profile: SiteProfile) -> Result<(), String> {
        std::fs::create_dir_all(&self.dir).map_err(|error| error.to_string())?;
        std::fs::write(self.file(&profile.id), profile.to_json())
            .map_err(|error| error.to_string())?;
        self.profiles.retain(|existing| existing.id != profile.id);
        self.profiles.push(profile);
        self.profiles.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(())
    }

    pub fn delete(&mut self, id: &str) -> Result<(), String> {
        match std::fs::remove_file(self.file(id)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        self.profiles.retain(|profile| profile.id != id);
        Ok(())
    }

    /// The file for a mapping. Ids come from page addresses, so anything
    /// that is not plainly safe in a file name is replaced.
    fn file(&self, id: &str) -> PathBuf {
        let safe: String = id
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        self.dir.join(format!("{safe}.json"))
    }
}

#[cfg(test)]
mod tests {
    use ogre_harness::sites::generic::{PageMap, UrlRule};

    use super::*;

    fn profile(id: &str, name: &str) -> SiteProfile {
        let page: PageMap = serde_json::from_value(serde_json::json!({
            "student_section": "div.student",
            "student_name": "b",
            "score_input": "input.score",
            "response": "div.answer",
        }))
        .unwrap();
        SiteProfile::new(
            id,
            name,
            UrlRule::new("grades.example.edu", "/course/*/grade"),
            page,
        )
    }

    fn scratch(test: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ogre-profiles-{test}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn mappings_survive_a_restart_and_can_be_removed() {
        let dir = scratch("roundtrip");
        let mut store = ProfileStore::open(dir.clone());
        assert!(store.all().is_empty());
        store.save(profile("b", "Zeta LMS")).unwrap();
        store.save(profile("a", "Alpha LMS")).unwrap();

        let reopened = ProfileStore::open(dir.clone());
        let names: Vec<_> = reopened.summaries().into_iter().map(|s| s.name).collect();
        assert_eq!(names, ["Alpha LMS", "Zeta LMS"]);
        assert_eq!(
            reopened.summaries()[0].pages,
            "grades.example.edu/course/*/grade"
        );
        assert_eq!(reopened.all()[0], profile("a", "Alpha LMS"));

        let mut store = reopened;
        store.delete("a").unwrap();
        store.delete("never-existed").unwrap();
        assert_eq!(ProfileStore::open(dir.clone()).all().len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn saving_again_replaces_and_odd_ids_stay_inside_the_folder() {
        let dir = scratch("replace");
        let mut store = ProfileStore::open(dir.clone());
        store.save(profile("../../evil", "First")).unwrap();
        store.save(profile("../../evil", "Renamed")).unwrap();
        assert_eq!(store.all().len(), 1);
        assert_eq!(store.all()[0].name, "Renamed");
        let files: Vec<_> = std::fs::read_dir(dir.join("profiles"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(files, ["______evil.json"]);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn an_unreadable_file_is_skipped_not_fatal() {
        let dir = scratch("broken");
        std::fs::create_dir_all(dir.join("profiles")).unwrap();
        std::fs::write(dir.join("profiles/broken.json"), "{ not json").unwrap();
        std::fs::write(dir.join("profiles/notes.txt"), "ignore me").unwrap();
        let mut store = ProfileStore::open(dir.clone());
        store.save(profile("ok", "Fine")).unwrap();
        assert_eq!(ProfileStore::open(dir.clone()).all().len(), 1);
        assert!(dir.join("profiles/broken.json").exists());
        let _ = std::fs::remove_dir_all(dir);
    }
}
