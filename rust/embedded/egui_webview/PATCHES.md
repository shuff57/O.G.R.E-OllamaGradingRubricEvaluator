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
3. `Cargo.toml` is OGRE's own: the original inherits from its workspace.

Not changed, and missing for OGRE: JavaScript dialogs (`alert`, `confirm`), file pickers and
drag and drop are not supported by the crate yet.
