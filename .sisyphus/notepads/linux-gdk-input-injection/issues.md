# Issues — linux-gdk-input-injection

## Session: ses_306461fcbffeuFY8EX58Nfwe7x | 2026-03-17

### Known Risks (from Metis analysis in plan)
1. **Widget handle access** — wry doesn't expose underlying GTK widget; must find WebKitWebView inside GtkFixed container children
2. **GDK window availability** — `widget.window()` returns None if widget isn't realized/mapped; must check state before injection
3. **Coordinate mapping** — GDK uses widget-local coordinates; element coords from `getBoundingClientRect()` must map correctly
4. **Main thread requirement** — all GTK ops MUST run via `app.run_on_main_thread()`
5. **Focus handling** — GDK keyboard events need keyboard focus; may need `widget.grab_focus()` first

### Gate Condition
T0 (Spike) MUST PASS before T1/T2. If T0 fails, entire GDK approach is blocked.
