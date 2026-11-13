//! Past grading sessions, read back from the records the audit log writes.
//!
//! Nothing here is kept in memory between visits to the History screen: the
//! records on disk are the history.

use std::path::Path;

use serde_json::Value;

/// The most sessions shown. Older ones stay on disk.
const MAX_SESSIONS: usize = 100;

/// One page that was read and then graded or written to.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct PastSession {
    /// When the page was read, in seconds since 1970. Also names the record.
    pub at: u64,
    pub url: String,
    pub title: String,
    /// The site's name, where the record has it.
    pub site: Option<String>,
    /// One per student on the page, in page order.
    pub students: Vec<PastStudent>,
    /// The rubric text the last grading run used.
    pub rubric: Option<String>,
    /// The scoring examples the last grading run showed the grader.
    pub examples: Option<String>,
    /// The teacher's skills the last grading run gave the grader, by name.
    pub skills: Vec<String>,
    /// What went wrong while writing, one line per student.
    pub problems: Vec<String>,
    pub end: SessionEnd,
}

/// How far a session got.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SessionEnd {
    /// Grades were proposed and none was written.
    #[default]
    NothingWritten,
    /// Grades were put in the page's form; the record shows no save.
    FilledIn,
    /// The site confirmed a save, or stores each grade as it is written.
    Saved,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct PastStudent {
    pub name: String,
    /// The score on the page when it was read.
    pub on_page: Option<f64>,
    pub proposal: Option<PastProposal>,
    /// The score as it was written to the page.
    pub written: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PastProposal {
    Score(f64),
    /// Why there was no grade.
    NotGraded(String),
}

impl PastSession {
    pub fn graded(&self) -> usize {
        self.students
            .iter()
            .filter(|s| matches!(s.proposal, Some(PastProposal::Score(_))))
            .count()
    }

    pub fn not_graded(&self) -> usize {
        self.students
            .iter()
            .filter(|s| matches!(s.proposal, Some(PastProposal::NotGraded(_))))
            .count()
    }

    pub fn written(&self) -> usize {
        self.students.iter().filter(|s| s.written.is_some()).count()
    }

    /// The students something happened to, which are the ones worth listing.
    pub fn touched(&self) -> impl Iterator<Item = &PastStudent> {
        self.students
            .iter()
            .filter(|s| s.proposal.is_some() || s.written.is_some())
    }

    /// Builds a session from one record: a JSON object per line, as the
    /// audit log writes them. `None` when the record has no page in it or
    /// nothing was graded or written.
    pub fn from_record(at: u64, record: &str) -> Option<Self> {
        let mut session: Option<Self> = None;
        let mut saves_on_write = false;
        let mut written_since_save = false;
        let mut saved = false;

        for event in record
            .lines()
            .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        {
            match (event["event"].as_str(), &mut session) {
                // A record holds one page; a second read in it is the same
                // page read again.
                (Some("read"), None) => {
                    saves_on_write = event["saves_on_write"].as_bool().unwrap_or(false);
                    session = Some(Self {
                        at,
                        url: text(&event["url"]),
                        title: text(&event["title"]),
                        site: event["site"].as_str().map(str::to_owned),
                        students: list(&event["students"])
                            .map(|student| PastStudent {
                                name: text(&student["name"]),
                                on_page: student["score"].as_f64(),
                                ..PastStudent::default()
                            })
                            .collect(),
                        ..Self::default()
                    });
                }
                (Some("graded"), Some(session)) => {
                    if let Some(rubric) = event["rubric"].as_str() {
                        session.rubric = Some(rubric.to_owned());
                        // What that run was shown, which may be nothing.
                        session.examples = event["examples"].as_str().map(str::to_owned);
                        session.skills = list(&event["skills"])
                            .filter_map(|name| name.as_str().map(str::to_owned))
                            .collect();
                    }
                    for result in list(&event["results"]) {
                        let Some(student) = student_at(session, &result["index"]) else {
                            continue;
                        };
                        student.proposal = Some(match result["score"].as_f64() {
                            Some(score) => PastProposal::Score(score),
                            None => PastProposal::NotGraded(text(&result["not_graded"])),
                        });
                    }
                }
                (Some("written"), Some(session)) => {
                    for write in list(&event["students"]) {
                        if let Some(student) = student_at(session, &write["index"]) {
                            student.written = Some(text(&write["score"]));
                            written_since_save = true;
                        }
                    }
                    for mismatch in list(&event["mismatches"]) {
                        session.problems.push(format!(
                            "{}: {}",
                            text(&mismatch["name"]),
                            text(&mismatch["problem"])
                        ));
                    }
                }
                (Some("saved"), Some(_)) => {
                    saved = true;
                    written_since_save = false;
                }
                _ => {}
            }
        }

        let mut session = session?;
        session.end = if session.written() == 0 {
            SessionEnd::NothingWritten
        } else if saves_on_write || (saved && !written_since_save) {
            SessionEnd::Saved
        } else {
            SessionEnd::FilledIn
        };
        (session.graded() + session.not_graded() + session.written() > 0).then_some(session)
    }
}

fn text(value: &Value) -> String {
    value.as_str().unwrap_or_default().to_owned()
}

fn list(value: &Value) -> impl Iterator<Item = &Value> {
    value.as_array().into_iter().flatten()
}

fn student_at<'a>(session: &'a mut PastSession, index: &Value) -> Option<&'a mut PastStudent> {
    session
        .students
        .get_mut(usize::try_from(index.as_u64()?).ok()?)
}

/// A grade a past run proposed, as the record has it: what the AI gave, not
/// what the teacher may have made of it afterwards.
#[derive(Debug, Clone, PartialEq)]
pub struct KeptGrade {
    pub student_id: Option<String>,
    pub name: String,
    pub score: f64,
    pub feedback_html: String,
    pub flag: Option<String>,
}

/// The grades the newest run on the page at `url` proposed, with when that
/// page was read. `None` if no record of that page proposed any.
///
/// Whether they ever reached the page the record cannot say for certain: a
/// grade filled in and not saved is gone. The page as it reads now says.
pub fn proposed_before(sessions_dir: &Path, url: &str) -> Option<(u64, Vec<KeptGrade>)> {
    let mut records: Vec<(u64, std::path::PathBuf)> = std::fs::read_dir(sessions_dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let at = path.file_stem()?.to_str()?.parse().ok()?;
            (path.extension()? == "jsonl").then_some((at, path))
        })
        .collect();
    records.sort_by_key(|(at, _)| std::cmp::Reverse(*at));
    records.into_iter().find_map(|(at, path)| {
        let grades = kept_grades(&std::fs::read_to_string(path).ok()?, url);
        (!grades.is_empty()).then_some((at, grades))
    })
}

/// The grades a record of the page at `url` proposed, the last word on each
/// student. Empty for a record of another page.
fn kept_grades(record: &str, url: &str) -> Vec<KeptGrade> {
    // By the student's place on the page as that record read it.
    let mut students: Vec<(Option<String>, String)> = Vec::new();
    let mut grades: std::collections::BTreeMap<usize, KeptGrade> = Default::default();
    // Grades the record says reached the site, which are not to be offered
    // again: written where writing stores, or filled in and then saved.
    let mut saves_on_write = false;
    let mut filled = std::collections::BTreeSet::new();
    let mut reached = std::collections::BTreeSet::new();
    for event in record
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
    {
        match event["event"].as_str() {
            Some("read") => {
                if event["url"].as_str() != Some(url) {
                    return Vec::new();
                }
                students = list(&event["students"])
                    .map(|s| (s["id"].as_str().map(str::to_owned), text(&s["name"])))
                    .collect();
                saves_on_write = event["saves_on_write"].as_bool().unwrap_or(false);
            }
            Some("written") => {
                let written = list(&event["students"])
                    .filter_map(|s| usize::try_from(s["index"].as_u64()?).ok());
                if saves_on_write {
                    reached.extend(written);
                } else {
                    filled.extend(written);
                }
            }
            Some("saved") => reached.append(&mut filled),
            Some("graded") => {
                for result in list(&event["results"]) {
                    let Some(at) = result["index"]
                        .as_u64()
                        .and_then(|at| usize::try_from(at).ok())
                    else {
                        continue;
                    };
                    let (Some((student_id, name)), Some(score)) =
                        (students.get(at), result["score"].as_f64())
                    else {
                        // Not graded in a later run: the earlier grade is
                        // not one to offer again.
                        grades.remove(&at);
                        continue;
                    };
                    // A grade given again is a new one, not yet on the site.
                    filled.remove(&at);
                    reached.remove(&at);
                    grades.insert(
                        at,
                        KeptGrade {
                            student_id: student_id.clone(),
                            name: name.clone(),
                            score,
                            feedback_html: text(&result["feedback"]),
                            flag: result["flag"].as_str().map(str::to_owned),
                        },
                    );
                }
            }
            _ => {}
        }
    }
    grades
        .into_iter()
        .filter(|(at, _)| !reached.contains(at))
        .map(|(_, grade)| grade)
        .collect()
}

/// The sessions recorded under `sessions_dir`, newest first. Records that
/// cannot be read are left out.
pub fn load(sessions_dir: &Path) -> Vec<PastSession> {
    let mut records: Vec<(u64, std::path::PathBuf)> = std::fs::read_dir(sessions_dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let at = path.file_stem()?.to_str()?.parse().ok()?;
            (path.extension()? == "jsonl").then_some((at, path))
        })
        .collect();
    records.sort_by_key(|(at, _)| std::cmp::Reverse(*at));
    records
        .into_iter()
        .filter_map(|(at, path)| PastSession::from_record(at, &std::fs::read_to_string(path).ok()?))
        .take(MAX_SESSIONS)
        .collect()
}

/// A moment as a teacher would write it: "11 Nov 2026, 15:42", in the
/// computer's own time zone where that can be found, otherwise in UTC.
pub fn when(at: u64) -> String {
    let (date, utc) = local_date(at);
    let stamp = format!(
        "{} {} {}, {:02}:{:02}",
        date.day,
        MONTHS[usize::from(date.month - 1)],
        date.year,
        date.hour,
        date.minute
    );
    if utc { format!("{stamp} UTC") } else { stamp }
}

const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Date {
    year: i64,
    /// 1 to 12.
    month: u8,
    day: u8,
    hour: u8,
    minute: u8,
}

/// The date and whether it is in UTC rather than local time.
#[cfg(unix)]
fn local_date(at: u64) -> (Date, bool) {
    let Ok(seconds) = libc::time_t::try_from(at) else {
        return (utc_date(at), true);
    };
    // SAFETY: `localtime_r` writes only to the `tm` it is given and reads
    // only the seconds it is given; both live for the whole call.
    let tm = unsafe {
        let mut tm: libc::tm = std::mem::zeroed();
        if libc::localtime_r(&seconds, &mut tm).is_null() {
            return (utc_date(at), true);
        }
        tm
    };
    let date = Date {
        year: i64::from(tm.tm_year) + 1900,
        month: (tm.tm_mon + 1).clamp(1, 12) as u8,
        day: tm.tm_mday.clamp(1, 31) as u8,
        hour: tm.tm_hour.clamp(0, 23) as u8,
        minute: tm.tm_min.clamp(0, 59) as u8,
    };
    (date, false)
}

#[cfg(not(unix))]
fn local_date(at: u64) -> (Date, bool) {
    (utc_date(at), true)
}

/// The calendar date in UTC, by the days-to-civil arithmetic.
fn utc_date(at: u64) -> Date {
    let days = (at / 86_400) as i64;
    let second_of_day = at % 86_400;
    // Days since 0000-03-01, in 400-year eras of 146097 days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_from_march = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_from_march + 2) / 5 + 1;
    let month = if month_from_march < 10 {
        month_from_march + 3
    } else {
        month_from_march - 9
    };
    Date {
        year: year_of_era + era * 400 + i64::from(month <= 2),
        month: month as u8,
        day: day as u8,
        hour: (second_of_day / 3_600) as u8,
        minute: (second_of_day % 3_600 / 60) as u8,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const READ: &str = r#"{"event":"read","url":"https://www.myopenmath.com/course/gradeallq2.php?cid=1","title":"Unit 4 FRQ","site":"MyOpenMath","saves_on_write":false,"students":[{"index":0,"id":"1","name":"Avery, Sam","score":10.0,"has_feedback":true},{"index":1,"id":"2","name":"Brook, Kai","score":0.0,"has_feedback":false},{"index":2,"id":"3","name":"Cruz, Jo","score":null,"has_feedback":false}],"at":100}"#;
    const GRADED: &str = r###"{"event":"graded","rubric":"## Concept [100%]\nNames it (0pts)","cancelled":false,"warnings":[],"results":[{"index":1,"score":6.0,"feedback":"<p>ok</p>","flag":null},{"index":2,"not_graded":"the AI gave no score"}],"at":130}"###;
    const WRITTEN: &str = r#"{"event":"written","students":[{"index":1,"id":"2","name":"Brook, Kai","field":"ud-2","was":"0","score":"6","feedback":"ok"}],"mismatches":[],"at":140}"#;
    const SAVED: &str = r#"{"event":"saved","at":150}"#;

    fn record(lines: &[&str]) -> String {
        lines.join("\n")
    }

    #[test]
    fn a_record_becomes_a_session() {
        let session =
            PastSession::from_record(100, &record(&[READ, GRADED, WRITTEN, SAVED])).unwrap();
        assert_eq!(session.title, "Unit 4 FRQ");
        assert_eq!(session.site.as_deref(), Some("MyOpenMath"));
        assert_eq!(session.students.len(), 3);
        assert_eq!(
            (session.graded(), session.not_graded(), session.written()),
            (1, 1, 1)
        );
        assert_eq!(session.end, SessionEnd::Saved);
        assert_eq!(
            session.rubric.as_deref(),
            Some("## Concept [100%]\nNames it (0pts)")
        );
        let kai = &session.students[1];
        assert_eq!(kai.on_page, Some(0.0));
        assert_eq!(kai.proposal, Some(PastProposal::Score(6.0)));
        assert_eq!(kai.written.as_deref(), Some("6"));
        assert_eq!(
            session.students[2].proposal,
            Some(PastProposal::NotGraded("the AI gave no score".into()))
        );
        let touched: Vec<_> = session.touched().map(|s| s.name.as_str()).collect();
        assert_eq!(touched, ["Brook, Kai", "Cruz, Jo"]);
    }

    #[test]
    fn a_grade_the_record_says_reached_the_site_is_not_kept_to_offer_again() {
        const URL: &str = "https://www.myopenmath.com/course/gradeallq2.php?cid=1";
        let names = |events: &[&str]| -> Vec<String> {
            kept_grades(&record(events), URL)
                .into_iter()
                .map(|grade| grade.name)
                .collect()
        };
        // Filled in and not saved: it may be gone, so it is kept.
        assert_eq!(names(&[READ, GRADED, WRITTEN]), ["Brook, Kai"]);
        // Saved: the site has it, also where the page cannot show that, as
        // with a zero on a site that has no feedback box.
        assert!(names(&[READ, GRADED, WRITTEN, SAVED]).is_empty());
        // Where writing stores, written is saved.
        let stores = READ.replace(r#""saves_on_write":false"#, r#""saves_on_write":true"#);
        assert!(names(&[&stores, GRADED, WRITTEN]).is_empty());
        // Graded again after that, the new grade is one the site has not seen.
        assert_eq!(
            names(&[READ, GRADED, WRITTEN, SAVED, GRADED]),
            ["Brook, Kai"]
        );
    }

    #[test]
    fn the_grades_a_run_proposed_can_be_read_back_for_the_same_page() {
        const URL: &str = "https://www.myopenmath.com/course/gradeallq2.php?cid=1";
        let kept = kept_grades(&record(&[READ, GRADED]), URL);
        assert_eq!(
            kept,
            [KeptGrade {
                student_id: Some("2".into()),
                name: "Brook, Kai".into(),
                score: 6.0,
                feedback_html: "<p>ok</p>".into(),
                flag: None,
            }]
        );
        // Not a record of another page, and not a student a later run in
        // the same record could not grade.
        assert!(kept_grades(&record(&[READ, GRADED]), "https://example.edu/other").is_empty());
        let later = r#"{"event":"graded","results":[{"index":1,"not_graded":"stopped"}],"at":135}"#;
        assert!(kept_grades(&record(&[READ, GRADED, later]), URL).is_empty());

        // On disk: the newest record of that page that proposed anything.
        let dir = std::env::temp_dir().join(format!("ogre-kept-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("100.jsonl"), record(&[READ, GRADED])).unwrap();
        // Read again later, with nothing graded: that record offers nothing.
        std::fs::write(dir.join("200.jsonl"), READ).unwrap();
        let (at, kept) = proposed_before(&dir, URL).unwrap();
        assert_eq!((at, kept.len()), (100, 1));
        assert_eq!(proposed_before(&dir, "https://example.edu/other"), None);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_examples_shown_to_the_grader_are_those_of_the_last_run() {
        let with_examples = GRADED.replace(
            r#""cancelled":false"#,
            r#""examples":"Excellent: all of it.","cancelled":false"#,
        );
        let session = PastSession::from_record(100, &record(&[READ, &with_examples])).unwrap();
        assert_eq!(session.examples.as_deref(), Some("Excellent: all of it."));

        assert!(session.skills.is_empty());
        let with_skills = GRADED.replace(
            r#""cancelled":false"#,
            r#""skills":["Late work","Units"],"cancelled":false"#,
        );
        let session = PastSession::from_record(100, &record(&[READ, &with_skills])).unwrap();
        assert_eq!(session.skills, ["Late work", "Units"]);
        let session =
            PastSession::from_record(100, &record(&[READ, &with_skills, GRADED])).unwrap();
        assert!(session.skills.is_empty(), "the last run was given none");

        // Graded again without any: the record of the last run stands.
        let session =
            PastSession::from_record(100, &record(&[READ, &with_examples, GRADED])).unwrap();
        assert_eq!(session.examples, None);
    }

    #[test]
    fn how_far_a_session_got_is_read_from_its_last_steps() {
        let end = |lines: &[&str]| PastSession::from_record(1, &record(lines)).unwrap().end;
        assert_eq!(end(&[READ, GRADED]), SessionEnd::NothingWritten);
        assert_eq!(end(&[READ, GRADED, WRITTEN]), SessionEnd::FilledIn);
        assert_eq!(end(&[READ, GRADED, WRITTEN, SAVED]), SessionEnd::Saved);
        // Grades filled in after the save are not saved.
        assert_eq!(
            end(&[READ, GRADED, WRITTEN, SAVED, WRITTEN]),
            SessionEnd::FilledIn
        );
        // A site that stores each grade as it is written needs no save.
        let stores = READ.replace(r#""saves_on_write":false"#, r#""saves_on_write":true"#);
        assert_eq!(end(&[&stores, GRADED, WRITTEN]), SessionEnd::Saved);
    }

    #[test]
    fn a_page_that_was_only_read_is_not_history() {
        assert_eq!(PastSession::from_record(1, READ), None);
        assert_eq!(PastSession::from_record(1, ""), None);
        assert_eq!(PastSession::from_record(1, "not json\n{}"), None);
        // Grades without the page they belong to cannot be shown.
        assert_eq!(PastSession::from_record(1, GRADED), None);
    }

    #[test]
    fn older_records_without_a_site_or_rubric_still_load() {
        let read = READ
            .replace(r#""site":"MyOpenMath","saves_on_write":false,"#, "")
            .replace("Unit 4 FRQ", "Old page");
        let graded = GRADED.replace(r###""rubric":"## Concept [100%]\nNames it (0pts)","###, "");
        let session = PastSession::from_record(1, &record(&[&read, &graded])).unwrap();
        assert_eq!(session.site, None);
        assert_eq!(session.rubric, None);
        assert_eq!(session.graded(), 1);
    }

    #[test]
    fn problems_while_writing_are_kept() {
        let written = WRITTEN.replace(
            r#""mismatches":[]"#,
            r#""mismatches":[{"name":"Brook, Kai","problem":"the score box holds 4"}]"#,
        );
        let session = PastSession::from_record(1, &record(&[READ, GRADED, &written])).unwrap();
        assert_eq!(session.problems, ["Brook, Kai: the score box holds 4"]);
    }

    #[test]
    fn sessions_load_newest_first_and_skip_what_is_not_a_record() {
        let dir = std::env::temp_dir().join(format!("ogre-test-history-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("100.jsonl"), record(&[READ, GRADED])).unwrap();
        std::fs::write(dir.join("300.jsonl"), record(&[READ, GRADED, WRITTEN])).unwrap();
        std::fs::write(dir.join("200.jsonl"), READ).unwrap();
        std::fs::write(dir.join("notes.txt"), "hello").unwrap();
        std::fs::write(dir.join("400.txt"), record(&[READ, GRADED])).unwrap();

        let sessions = load(&dir);
        let order: Vec<u64> = sessions.iter().map(|s| s.at).collect();
        assert_eq!(order, [300, 100]);
        assert!(load(&dir.join("missing")).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn dates_in_utc_are_worked_out_correctly() {
        let date = |at| {
            let d = utc_date(at);
            (d.year, d.month, d.day, d.hour, d.minute)
        };
        assert_eq!(date(0), (1970, 1, 1, 0, 0));
        assert_eq!(date(951_782_400), (2000, 2, 29, 0, 0));
        assert_eq!(date(1_794_448_102), (2026, 11, 12, 1, 48));
        assert_eq!(date(1_709_251_199), (2024, 2, 29, 23, 59));
    }

    #[test]
    fn a_moment_reads_as_a_date_and_time() {
        let text = when(1_794_448_102);
        assert!(text.contains(" 2026, "), "{text}");
        assert!(text.contains("Nov "), "{text}");
    }
}
