//! Tasks OGRE itself gives the agent, as against the teacher's own.

/// The task for an agent that is to get to a grading page and do nothing
/// else. `what` is the teacher's own name for the page: a class, an
/// assignment, a question.
pub fn find_grading_page_task(what: &str) -> String {
    format!(
        "Find the page of this site where a teacher grades students' answers, for: {}\n\n\
         Get there from the page that is open, by following links, menus and buttons that only \
         show another page. Do not type a score or feedback, do not save or submit anything, \
         and do not change any setting. Stop as soon as the page shows students' answers with \
         a box for a score, and finish by saying in one line where you ended up. If you cannot \
         get there, finish as not done and say what is in the way.",
        what.trim()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_task_names_the_page_and_forbids_grading() {
        let task = find_grading_page_task("  Quiz 4 in Algebra 2 ");
        assert!(task.contains("for: Quiz 4 in Algebra 2\n"));
        assert!(task.contains("Do not type a score"));
        assert!(task.contains("do not save or submit"));
    }
}
