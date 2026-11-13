# OGRE with a built-in browser

An experiment. The usual OGRE (`../crates/ogre-app`) drives a Chrome of its own. This build
links Chromium into OGRE, through CEF and a copy of the unpublished `egui_webview` crate, and
the teacher can choose in Settings to work in that browser instead: "Where the page is shown",
"In the browser built into OGRE". Everything else is the same program and the same data folder.

    ./run.sh

The first build downloads Chromium (about 1 GB) and needs CMake and Ninja.

## How it fits together

- `../crates/ogre-app` knows nothing about Chromium. It has a `BuiltInBrowser` trait and, when a
  program hands it one, a third choice in Settings. Its worker reads and writes the built-in
  page through `BuiltInPage`, which runs the site adapters' scripts in the page and gets their
  values back through `window.ipc.postMessage`.
- `src/lib.rs` is that trait for a Chromium page. `src/main.rs` is OGRE with it.
- `egui_webview/` is the copied crate. `egui_webview/PATCHES.md` says what was changed and why.
- This folder is a Cargo workspace of its own, because the crate needs an unreleased egui
  (`[patch.crates-io]` in `Cargo.toml`) that the usual build should not be moved to.

## Checked

    cargo run --example bridge_check

reads a practice MyOpenMath page with OGRE's real reader through the built-in browser, writes
a grade into it and reads it back.

## Not there yet

- The agent, and reading a rubric from a picture of the page: both need real mouse and
  keyboard input and screenshots, which the copied crate does not give OGRE.
- A page's own questions (`alert`, `confirm`), file pickers, drag and drop: not in the crate.
- Packaging. An installed app would have to carry Chromium's files, several hundred MB.
- The sign-in is the built-in browser's own, kept in `built-in-browser/` in OGRE's data
  folder, apart from the Chrome profile. Only one running OGRE can use it at a time.
