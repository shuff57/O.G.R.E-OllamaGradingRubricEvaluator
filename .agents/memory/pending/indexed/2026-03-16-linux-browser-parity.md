# Linux Browser Parity — Session Learnings (2026-03-16)

## What Was Done
- Debugged and fixed evalScript on Linux: async IIFE wrapper returned a Promise that wry couldn't serialize → replaced with synchronous wrapper + two-phase polling for async scripts
- Made screenshot capture non-fatal in discovery flow (SecurityError on cross-origin grading pages)
- Added opener plugin URL scopes for OAuth providers (Anthropic, OpenAI, Google, GitHub)
- Fixed UPSERT bug in saveSiteProfile — pre-generated UUIDs took UPDATE branch, matched 0 rows, saved nothing
- Fixed modal dialogs hidden behind native wry webview on Linux (hide webview when dialogs open)
- Created GDK event injection plan for real input simulation on Linux
- Compared discovered vs built-in MOM profile — discovery gets ~40% right

## Patterns Noticed
- **wry evaluate_script_with_callback does NOT await Promises on WebKitGTK**: The callback receives the Promise object (serialized as empty), not the resolved value. Any async script needs the two-phase approach (store in global → poll).
- **Native GTK widgets always paint on top of Tauri DOM**: Any position:fixed overlay (modals, dialogs) in the Tauri webview is hidden behind the wry WebKitGTK widget. Must call hideWebview() before showing overlays.
- **SQLite UPSERT pitfall**: Never use `if (id) UPDATE else INSERT` when callers pre-generate UUIDs. Use `INSERT ON CONFLICT DO UPDATE` instead.
- **wry returns empty string for undefined/void**: Guard with `if (result.is_empty()) "null"` in Rust.
- **DB location on Linux**: ogre.db lives at `~/.config/com.ogre.desktop/ogre.db`, NOT `~/.local/share/`. The SQL plugin uses config dir, not data dir.
- **Tauri opener plugin needs explicit URL scopes**: `opener:allow-open-url` permission alone isn't enough — need `allow: [{ url: "https://..." }]` patterns.

## Corrections Received
- First fix attempt (remove async, add JSON.stringify in wrapper) would have caused double-JSON since wry also serializes. Simplified to let wry handle serialization natively.
- Initial webview hide was only on the confirmation flow path, not the direct save button path. User reported it still froze — had to add hideWebview to the onSave callback in DiscoveryResults too.

## Discovery vs Built-in Profile Gaps
- Discovery can't infer TinyMCE (sees raw textarea, not contenteditable overlay)
- Discovery misses hidden input sync patterns (form submission internals)
- Discovery doesn't produce extraction configs (responsePath, maxScoreRegex)
- Discovery gets structural selectors right: fullCreditLink, scoreInput (by id), questionRegion (by class)
- Heuristic path works for non-grading pages; grading pages with cross-origin iframes need AI fallback

## Skill Improvement Suggestions
- **grade-show-work skill**: Should document that evalScript on Linux uses wry callback (not CDP), and async scripts use polling
- **site-profiler skill**: Should note that discovery misses TinyMCE, hidden input sync, and extraction configs — these require domain knowledge
- **New skill candidate**: "linux-webview-debugging" — documenting wry quirks, GTK layering, evalScript async handling, DB location differences

## Open Issues
- Anthropic API 400 error during discovery on grading pages — text-only path (no screenshot) should work but returns generic "Error". Needs server-side logging to diagnose.
- GDK event injection plan written but not executed — spike T0 (access GdkWindow from wry) is the gate condition.
