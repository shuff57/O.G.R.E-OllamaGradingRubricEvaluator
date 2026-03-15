# gh

GitHub CLI for repository operations.

## Working directory

Any (repo-aware).

## Key commands

| Command | Purpose |
|---------|---------|
| `gh pr create` | Create a pull request |
| `gh pr list` | List open PRs |
| `gh pr view <number>` | View PR details |
| `gh release list` | List releases |
| `gh release create <tag>` | Create a new release |
| `gh issue list` | List open issues |
| `gh issue create` | Create an issue |
| `gh run list` | List recent Actions workflow runs |
| `gh run view <id>` | View workflow run details/logs |
| `gh api <endpoint>` | Raw GitHub API calls |

## Project-specific usage

- Releases are tagged on the `desktop` branch for desktop app builds.
- GitHub Actions CI builds installers on tag push (`v*`).
- Release artifacts: MSI, NSIS exe, `latest.json` (updater manifest).

## Notes

- Prefer `gh` over raw `curl` for authenticated GitHub API calls.
- `gh run view <id> --log` shows full CI logs.
