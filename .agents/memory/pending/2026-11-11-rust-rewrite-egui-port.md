# Session reflection: OGRE rewritten in Rust (egui/eframe)

Date: 2026-11-11. Branch `rust-rewrite`, folder `rust/`. Status and open items: `.planning/ROADMAP.md`, section "Rust rewrite".

## What was done

- Ported all four areas to a Rust workspace: MyOpenMath batch grading, Canvas, bring-your-own-site mapping, agent mode and skills. Six crates: `ogre-core`, `ogre-llm`, `ogre-grader`, `ogre-harness`, `ogre-agent`, `ogre-app`.
- The app drives the teacher's own Chrome over the DevTools Protocol through a private pipe, with a small client of our own (no chromiumoxide). No grading server.
- Grading is a faithful port of `grading-server/grading.js`: prompts byte for byte, parsing checked against the JavaScript with golden tests.
- Added after the port: rubric editing, History screen, elapsed clock, a read that waits for a page that is still arriving.
- Release binary cut from 57.8 MB to 16.7 MB (verSHion's release profile, OpenGL renderer, subset fonts, own Chrome client).
- Checked read-only against three real, already-graded MyOpenMath pages (69 students) and once through the app's own window and Chrome.

## Patterns noticed

- **Agreement with old grades is about one point of 14, and the limit is the model, not the page reading.** Old and new feedback agree on which requirements are correct for about 95% of verdicts. What differs is the points the model takes off per missed requirement, which is its own 0 to 10 judgment.
- **Old grades are not a clean target.** A page graded before the Electron app's 28 October fix has students marked all correct but scored 12.5 of 14. Date a page's grades before treating them as the answer.
- **Two runs of the same page differ by about 0.36 of 14.** A gap much larger than that is systematic.
- **MyOpenMath shows its sign-in page for about three seconds after a page opens, then the page itself.** Reading at once finds no students. The app now retries for eight seconds after an open.
- **The Electron app's default pipeline is not "the rubric as scraped".** It turns the rubric into text, fills in equal category weights, and at leniency other than 50 has the AI reword the rubric. The teacher's saved leniency was 0. Matching that mattered more than any parsing detail.
- **A local 31B model was too slow to test with** (8k context, minutes per request). Ollama Cloud with the same model name was used instead, with the teacher's agreement, since it sends student work off the computer.
- **Comparison tools must never print student names or answers.** Number the students, print counts and rubric wording only, delete any dump afterwards.

## Corrections received

- "Don't think you have to create all of the code, check for GitHub repos that might help" — look for existing crates first.
- "For a UI design philosophy, use verSHion" — paper tones, one green accent, one primary button, highlighter as a marker only.
- "We need to get closer to the original app" — parity with the Electron pipeline came before new behaviour.
- Reduce size and optimise only after the port, without removing features.
- Linux only for now. Default leniency stays 50. Fix both scoring rules that inflated grades (category scores divided by category points; raise-to-full on feedback that criticises in unlisted words).

## Skill creation/improvement suggestions

- A "compare with existing grades" skill: read-only re-grade of an already-graded page, numbered students, verdict-by-verdict table. `rust/crates/ogre-app/examples/compare_live.rs` and `tests/live.rs` are the working versions.
- `batch-grader` and related skills describe the Electron flow; they need a Rust-app counterpart once a real write has been supervised.
- Open design question for a later session: derive the score from the per-requirement verdicts so grades repeat exactly.
