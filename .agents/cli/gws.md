# gws (Google Workspace CLI)

One CLI for all of Google Workspace — Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin, and more. Dynamically built from Google Discovery Service. Structured JSON output for agent consumption.

## Installation

```bash
npm install -g @googleworkspace/cli
```

Requires Node.js 18+.

## Auth setup

| Command | Purpose |
|---------|---------|
| `gws auth setup` | One-time: creates GCP project, enables APIs, logs you in (requires `gcloud`) |
| `gws auth login` | Subsequent OAuth login with scope selection |
| `gws auth login -s drive,gmail,sheets` | Login with specific scopes only (for unverified apps) |
| `gws auth export --unmasked > creds.json` | Export credentials for headless/CI use |

## Key commands

| Command | Purpose |
|---------|---------|
| `gws drive files list --params '{"pageSize": 10}'` | List Drive files |
| `gws drive +upload ./file.pdf --name "Report"` | Upload file to Drive |
| `gws gmail +send --to addr --subject "Hi" --body "..."` | Send an email |
| `gws gmail +triage` | Show unread inbox summary |
| `gws gmail +reply --message-id ID --body "..."` | Reply to a message |
| `gws sheets +read --spreadsheet ID --range 'Sheet1!A1:C10'` | Read spreadsheet values |
| `gws sheets +append --spreadsheet ID --values "Alice,95"` | Append a row |
| `gws calendar +agenda` | Show upcoming events |
| `gws calendar +insert` | Create a new event |
| `gws chat +send` | Send a Chat message |
| `gws workflow +standup-report` | Today's meetings + tasks summary |
| `gws workflow +weekly-digest` | Weekly meeting + email summary |
| `gws schema <service.resource.method>` | Inspect any method's request/response schema |

## Flags

| Flag | Purpose |
|------|---------|
| `--params <JSON>` | URL/query parameters |
| `--json <JSON>` | Request body (POST/PATCH/PUT) |
| `--upload <PATH>` | File to upload (multipart) |
| `--output <PATH>` | Output path for binary responses |
| `--format <FMT>` | Output format: `json` (default), `table`, `yaml`, `csv` |
| `--page-all` | Auto-paginate (NDJSON) |
| `--dry-run` | Preview request without executing |

## Services

Commands are built dynamically from Google Discovery Service. Core services:

`drive`, `sheets`, `gmail`, `calendar`, `docs`, `chat`, `admin`, `tasks`, `script`, `classroom`, `forms`, `slides`, `vault`, `people`

Run `gws <service> --help` to see all resources and helper commands (`+` prefixed).

## Agent skills

Ships 100+ agent skills. Install with:

```bash
npx skills add https://github.com/googleworkspace/cli
# Or individual services:
npx skills add https://github.com/googleworkspace/cli/tree/main/skills/gws-drive
```

## Notes

- All output is structured JSON by default — ideal for agent consumption.
- Helper commands (prefixed with `+`) are hand-crafted convenience shortcuts.
- Time-aware helpers use your Google account timezone automatically.
- Credentials are encrypted at rest (AES-256-GCM) with OS keyring.
- Not an officially supported Google product.
