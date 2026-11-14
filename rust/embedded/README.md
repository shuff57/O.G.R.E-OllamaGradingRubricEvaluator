# OGRE with a built-in browser

An experiment. The usual OGRE (`../crates/ogre-app`) drives a Chrome of its own. This build
links Chromium into OGRE, through CEF and a copy of the unpublished `egui_webview` crate, and
the teacher can choose in Settings to work in that browser instead: "Where the page is shown",
"In the browser built into OGRE". Everything else is the same program and the same data folder.

    ./run.sh        build and start it from here
    ./install.sh    build and install it for this user, with a menu entry

The first build downloads Chromium (about 1 GB) and needs CMake and Ninja. Installed, it takes
about 400 MB in `~/.local/lib/ogre-built-in`, beside the usual OGRE and sharing its data.
`./install.sh --remove` takes it away again.

## How it fits together

- `../crates/ogre-app` knows nothing about Chromium. It has a `BuiltInBrowser` trait and, when a
  program hands it one, a third choice in Settings.
- The worker drives the built-in page with the same driver it has for Chrome
  (`ogre_harness::cdp`), over Chromium's own debugging channel (the DevTools protocol). The
  browser lives on the window's thread, so the window carries the messages both ways between
  frames (`BuiltIn::pump` in `../crates/ogre-app/src/built_in.rs`). The built-in page therefore
  does what a Chrome tab does: scripts, real clicks and keys, pictures of the page, frames.
- What the page asks (`alert`, `confirm`, `prompt`, "Leave site?") comes through the browser
  itself and is shown in OGRE's window with its answers. A "Leave site?" is agreed to without
  asking when OGRE itself has just sent the page somewhere.
- `src/lib.rs` is that trait for a Chromium page. `src/main.rs` is OGRE with it.
- `egui_webview/` is the copied crate. `egui_webview/PATCHES.md` says what was changed and why.
- This folder is a Cargo workspace of its own, because the crate needs an unreleased egui
  (`[patch.crates-io]` in `Cargo.toml`) that the usual build should not be moved to.

## Checked

    cargo run --example bridge_check

opens a window for a few seconds and, through the built-in browser: reads a practice MyOpenMath
page with OGRE's real reader, writes a grade into it and reads it back; clicks and presses a
key as a person would; takes a picture of the page; has the page ask a question and answers it;
and reads inside a frame, inside a frame that shows another site, and inside a frame of that.

It needs a screen that is drawn to. Where there is none to spare, a made-up one does:

    env -u WAYLAND_DISPLAY xvfb-run -a ./target/release/examples/bridge_check

    OGRE_OPEN=<address> OGRE_SHOT=<file.png> ./run.sh

starts at that page in the built-in browser and, after `OGRE_SHOT_AFTER` seconds (10 if not
said), saves a picture of OGRE's own window and ends. For checking this build without a tool
that takes pictures of the screen.

## Not there yet

- File pickers and drag and drop: not in the copied crate.
- Nothing here has been used on a real signed-in grading page.
- The sign-in is the built-in browser's own, kept in `built-in-browser/` in OGRE's data
  folder, apart from the Chrome profile. Only one running OGRE can use it at a time.
