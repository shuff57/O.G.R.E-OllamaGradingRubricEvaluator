# What OGRE changed in this copy

The source is `crates/egui_webview` of https://github.com/rerun-io/egui_crates at commit
`ab18cba39c1a15da0b51c709855c5be6a274ec5c` (branch `lucas/egui-webview-cef`, 12 November 2026),
an unpublished draft. To take a newer version: copy its `src/` over this one and make these
changes again. Each is marked in the code with a comment that starts "OGRE:".

1. `src/chromium/runtime.rs`: `set_cache_dir`, exported as `egui_webview::set_cef_cache_dir`.
   The crate gives CEF a temporary directory per process, so nothing is kept between runs.
   A teacher's sign-in has to be. With a directory set, CEF's `cache_path` is that directory
   too and session cookies are persisted.
2. `src/instance.rs`: `WebViewInstance::take_events` is public. `ui` returns a page's events
   only while the page is shown, and OGRE reads and writes a page while another screen is in
   front.
3. `src/chromium/runtime.rs`: Chromium's display backend is X11 wherever an X server is there
   (`DISPLAY` is set), and Wayland only otherwise. The crate picks Wayland whenever
   `WAYLAND_DISPLAY` is set. On a Wayland display at a fractional scale (1.7, KDE) the page then
   filled only 1/1.7 of its place in each direction. `--ozone-platform=…` on the command line
   still overrides either.
4. The browser's own debugging channel (the DevTools protocol), CEF only:
   `WebViewInstance::send_devtools_message` and `Backend::send_devtools_message` send one
   message, and replies and events come back as the new `WebViewEvent::DevTools`
   (`src/lib.rs`, `src/backend.rs`, `src/instance.rs`, `src/chromium/mod.rs`,
   `src/chromium/client.rs`). OGRE drives the page through it with the driver it has for
   Chrome, which gives the built-in browser real clicks and keys, pictures of the page, the
   page's pop-up questions and frames. The observer is only registered once a first message
   is sent.
5. What the page asks, CEF only: `alert`, `confirm`, `prompt` and the browser's "Leave site?"
   arrive as the new `WebViewEvent::Asks` (with the new `DialogKind`) and are answered with
   `WebViewInstance::answer_dialog`; `WebViewEvent::AsksNoMore` says a question is over
   (`src/lib.rs`, `src/backend.rs`, `src/instance.rs`, `src/chromium/mod.rs`,
   `src/chromium/client.rs`). A windowless browser has no window of its own to ask in. The
   DevTools channel reports such a question too, but cannot answer it in CEF.
6. `Cargo.toml` is OGRE's own: the original inherits from its workspace.
7. A file the page asks for, CEF only: clicking a file box arrives as the new
   `WebViewEvent::AsksForFiles`, and `WebViewInstance::answer_files` gives the page the files, or
   none (`src/lib.rs`, `src/backend.rs`, `src/instance.rs`, `src/chromium/mod.rs`,
   `src/chromium/client.rs`). A windowless browser has no window to show a file chooser in.
   A request for a folder, or for a place to save to, is turned down without asking.

Not changed, and missing for OGRE: file pickers and drag and drop are not supported by the
crate yet.
