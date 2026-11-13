//! Going through the students of a site that shows one at a time.
//!
//! Such a page is read by pressing its "next student" button until there is
//! no next, and written by going back to each student in turn. A student is
//! found again by their own address where the site gives each one, and by
//! the buttons where it does not; either way the name on the page has to be
//! the one that was read there before anything is written.

use std::collections::HashSet;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::json;

use super::inspect::{self, Inspection, call};
use super::profile::SiteProfile;
use super::validate;
use crate::driver::eval_as;
use crate::{Error, PageDriver, Result};

const STEP_SCRIPT: &str = include_str!("step.js");

/// How often the page is looked at while another student is loading.
const POLL: Duration = Duration::from_millis(150);
/// More students than this is taken for a site going round in circles.
const MOST_STUDENTS: usize = 500;

/// Which way to move.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Step {
    Next,
    Previous,
}

impl Step {
    fn word(self) -> &'static str {
        match self {
            Self::Next => "next",
            Self::Previous => "previous",
        }
    }
}

/// One student as the walk met them: enough to tell that the page has moved
/// on, and to find the student again.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(super) struct Stop {
    pub name: String,
    pub url: String,
    /// A hash of the student's response. Two students in a row may share a
    /// name; they rarely share an answer too.
    mark: u64,
}

impl Stop {
    /// The student a page that shows one student is showing.
    pub fn of(found: &Inspection) -> Option<Self> {
        let student = found.students.first()?;
        let mut hasher = DefaultHasher::new();
        student.response.markdown().hash(&mut hasher);
        Some(Self {
            name: student.name.text.clone(),
            url: found.url.clone(),
            mark: hasher.finish(),
        })
    }

    /// True if this is the same student at the same address. The response is
    /// left out: it is only there to notice a change.
    fn is(&self, other: &Self) -> bool {
        self.name == other.name && self.url == other.url
    }
}

/// The students of one read, in the order they were met.
#[derive(Debug, Clone)]
pub(super) struct Route {
    pub stops: Vec<Stop>,
    /// True if every student has an address of their own, so that any of
    /// them can be opened directly.
    own_addresses: bool,
    /// The student the page shows, as far as is known.
    at: Option<usize>,
}

impl Route {
    pub fn new(stops: Vec<Stop>) -> Self {
        let addresses: HashSet<&str> = stops.iter().map(|stop| stop.url.as_str()).collect();
        Self {
            own_addresses: addresses.len() == stops.len(),
            at: stops.len().checked_sub(1),
            stops,
        }
    }

    /// Which student `shown` is. Where the page was last known to be wins; a
    /// student met twice with the same name and address is otherwise not
    /// told apart.
    fn place_of(&self, shown: &Stop) -> Option<usize> {
        if let Some(at) = self.at
            && self.stops.get(at).is_some_and(|stop| stop.is(shown))
        {
            return Some(at);
        }
        let mut alike = (0..self.stops.len()).filter(|&at| self.stops[at].is(shown));
        let first = alike.next()?;
        alike.next().is_none().then_some(first)
    }
}

#[derive(Deserialize)]
struct Pressed {
    pressed: bool,
    reason: Option<String>,
}

/// Moving between the students of one profile's pages.
pub(super) struct Walker<'a> {
    pub profile: &'a SiteProfile,
    /// How long another student may take to show.
    pub settle: Duration,
}

impl Walker<'_> {
    /// The page as it stands, if it shows a student by name. A student who
    /// cannot be graded, as one who handed nothing in may have no score
    /// box, is still a student to list and to pass on the way to the next.
    async fn look(&self, page: &dyn PageDriver) -> Option<(Inspection, Stop)> {
        let found = inspect::inspect(page, &self.profile.page).await.ok()?;
        let named = found
            .students
            .first()
            .is_some_and(|student| student.name.count == 1 && !student.name.text.is_empty());
        if !named {
            return None;
        }
        let stop = Stop::of(&found)?;
        Some((found, stop))
    }

    /// Waits until the page shows a student and has stopped changing: two
    /// looks in a row that agree. With `other_than`, that student does not
    /// count. `None` if that does not happen in time.
    ///
    /// A page that is loading may not be readable at all; that is not an
    /// error here, only not yet what is waited for.
    async fn settled(
        &self,
        page: &dyn PageDriver,
        other_than: Option<&Stop>,
    ) -> Option<(Inspection, Stop)> {
        let started = Instant::now();
        let mut last: Option<Stop> = None;
        while started.elapsed() < self.settle {
            tokio::time::sleep(POLL).await;
            let Some((found, stop)) = self.look(page).await else {
                last = None;
                continue;
            };
            if other_than == Some(&stop) {
                last = None;
                continue;
            }
            if last.as_ref() == Some(&stop) {
                return Some((found, stop));
            }
            last = Some(stop);
        }
        None
    }

    /// Presses the button to another student. `Err` with the reason if the
    /// button cannot be pressed as the page stands.
    async fn press(
        &self,
        page: &dyn PageDriver,
        step: Step,
    ) -> Result<std::result::Result<(), String>> {
        let script = call(STEP_SCRIPT, &self.profile.page, &json!(step.word()))?;
        let pressed: Pressed = eval_as(page, &script).await?;
        Ok(if pressed.pressed {
            Ok(())
        } else {
            Err(pressed
                .reason
                .unwrap_or_else(|| "the button could not be pressed".into()))
        })
    }

    /// Every student from the one shown to the last, in order, each with the
    /// page as it was read for them.
    pub async fn everyone(
        &self,
        page: &dyn PageDriver,
        first: Inspection,
    ) -> Result<Vec<(Inspection, Stop)>> {
        let stop = Stop::of(&first).ok_or_else(|| Error::Page("no student is shown".into()))?;
        let mut met = vec![(first, stop)];
        loop {
            let (shown, stop) = met.last().expect("starts with one student");
            if !shown.next.is_some_and(|button| button.enabled) {
                break;
            }
            if met.len() >= MOST_STUDENTS {
                return Err(Error::Page(format!(
                    "The button to the next student was pressed {MOST_STUDENTS} times and there \
                     was always another student. OGRE stopped rather than go on for ever."
                )));
            }
            let stop = stop.clone();
            if self.press(page, Step::Next).await?.is_err() {
                break;
            }
            let Some((found, next)) = self.settled(page, Some(&stop)).await else {
                // Nothing new in the time allowed. With the page as it was,
                // that was the last student. A page that has become
                // something unreadable is not the end of the list, and to
                // stop here would leave students out without a word.
                let now = inspect::inspect(page, &self.profile.page).await.ok();
                if now.as_ref().and_then(Stop::of).as_ref() == Some(&stop) {
                    break;
                }
                return Err(Error::Page(format!(
                    "After \u{201c}{}\u{201d}, the button to the next student led to a page \
                     OGRE could not read, so the students after them are not known. OGRE \
                     read {} before that and changed nothing.",
                    stop.name,
                    met.len()
                )));
            };
            // A site may go round to the first student again.
            if met.iter().any(|(_, seen)| *seen == next) {
                break;
            }
            met.push((found, next));
        }
        Ok(met)
    }

    /// Goes back to the first student of `route`, if the page shows one of
    /// its students. `None` if it shows someone else, as on another
    /// assignment of the same site, or if there is no way back.
    pub async fn back_to_first(
        &self,
        page: &dyn PageDriver,
        route: &mut Route,
    ) -> Option<Inspection> {
        let (_, shown) = self.look(page).await?;
        route.place_of(&shown)?;
        self.go_to(page, route, 0).await.ok()
    }

    /// Shows student number `to` of `route` and gives the page as it then is.
    /// Fails, without anything being written, if the student there is not
    /// the one that was read there.
    pub async fn go_to(
        &self,
        page: &dyn PageDriver,
        route: &mut Route,
        to: usize,
    ) -> Result<Inspection> {
        let lost = || {
            Error::Page(
                "OGRE lost its place among the students: the page shows one it did not read. \
                 Read the students again."
                    .into(),
            )
        };
        let want = route.stops.get(to).ok_or_else(lost)?.clone();
        // The page may still be loading from the last move.
        let (mut found, shown) = match self.look(page).await {
            Some(seen) => seen,
            None => self.settled(page, None).await.ok_or_else(lost)?,
        };
        let mut at = route.place_of(&shown);
        route.at = None;

        if at != Some(to) && route.own_addresses {
            page.navigate(&want.url).await?;
            let (opened, shown) = self.settled(page, None).await.ok_or_else(lost)?;
            found = opened;
            at = route.place_of(&shown);
        } else if at != Some(to) {
            let can_go_back = self.profile.page.previous_student.is_some();
            if at.is_none_or(|here| here > to && !can_go_back) {
                // Start over from the first student's address.
                page.navigate(&route.stops[0].url).await?;
                let (opened, shown) = self.settled(page, None).await.ok_or_else(lost)?;
                found = opened;
                at = route.place_of(&shown);
            }
            let mut here = at.ok_or_else(lost)?;
            while here != to {
                let step = if here < to {
                    Step::Next
                } else if can_go_back {
                    Step::Previous
                } else {
                    return Err(Error::Page(
                        "This site has no way back to an earlier student that OGRE knows of. \
                         Map its button to the previous student on the Sites screen."
                            .into(),
                    ));
                };
                let before = Stop::of(&found).ok_or_else(lost)?;
                if let Err(reason) = self.press(page, step).await? {
                    return Err(Error::Page(format!(
                        "OGRE could not go to the {} student: {reason}.",
                        step.word()
                    )));
                }
                let (moved, _) = self.settled(page, Some(&before)).await.ok_or_else(|| {
                    Error::Page(format!(
                        "The page did not show another student after the button to the {} \
                             student was pressed.",
                        step.word()
                    ))
                })?;
                found = moved;
                here = if step == Step::Next {
                    here + 1
                } else {
                    here - 1
                };
            }
            at = Some(to);
        }

        let shown = Stop::of(&found).ok_or_else(lost)?;
        // Students on the way are only passed. This one is to be read or
        // written, so the profile has to fit their page.
        let report = validate::report(self.profile, &found);
        if at == Some(to) && shown.name == want.name && !report.passed() {
            return Err(Error::Page(format!(
                "{}: this student\u{2019}s page does not fit the site profile \"{}\":\n{}",
                want.name,
                self.profile.name,
                report.error_summary()
            )));
        }
        if at != Some(to) || shown.name != want.name {
            return Err(Error::Page(format!(
                "The page shows \u{201c}{}\u{201d} where \u{201c}{}\u{201d} was when the students \
                 were read. Nothing was written. Read the students again.",
                shown.name, want.name
            )));
        }
        route.at = Some(to);
        Ok(found)
    }
}

/// The name a box of student number `at` goes by: the same box is every
/// student's on a site that shows one at a time, so the student's place is
/// part of it.
pub(super) fn field_of(at: usize, field: &str) -> String {
    format!("{at}/{field}")
}

/// Takes [`field_of`] apart again.
pub(super) fn place_and_field(field: &str) -> Option<(usize, &str)> {
    let (at, field) = field.split_once('/')?;
    Some((at.parse().ok()?, field))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stop(name: &str, url: &str) -> Stop {
        Stop {
            name: name.into(),
            url: url.into(),
            mark: 0,
        }
    }

    #[test]
    fn a_route_knows_whether_each_student_has_their_own_address() {
        let own = Route::new(vec![stop("A", "/grade?s=1"), stop("B", "/grade?s=2")]);
        assert!(own.own_addresses);
        assert_eq!(own.at, Some(1), "a read ends on the last student");
        let shared = Route::new(vec![stop("A", "/grade"), stop("B", "/grade")]);
        assert!(!shared.own_addresses);
    }

    #[test]
    fn a_student_is_placed_by_name_and_address() {
        let mut route = Route::new(vec![
            stop("Avery", "/grade"),
            stop("Brook", "/grade"),
            stop("Avery", "/grade"),
        ]);
        assert_eq!(route.place_of(&stop("Brook", "/grade")), Some(1));
        // Two students with one name at one address: where the page was
        // last known to be decides, and without that nothing does.
        assert_eq!(route.place_of(&stop("Avery", "/grade")), Some(2));
        route.at = Some(0);
        assert_eq!(route.place_of(&stop("Avery", "/grade")), Some(0));
        route.at = None;
        assert_eq!(route.place_of(&stop("Avery", "/grade")), None);
        assert_eq!(route.place_of(&stop("Casey", "/grade")), None);
    }

    #[test]
    fn a_box_is_named_with_the_place_of_its_student() {
        let named = field_of(12, "name:score/total");
        assert_eq!(named, "12/name:score/total");
        assert_eq!(place_and_field(&named), Some((12, "name:score/total")));
        assert_eq!(place_and_field("name:score"), None);
        assert_eq!(place_and_field("x/name:score"), None);
    }
}
