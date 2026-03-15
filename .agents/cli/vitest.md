# vitest

Test runner used across both the grading-server and ogre-desktop.

## Working directories

- `grading-server/` — server-side tests
- `ogre-desktop/` — frontend/desktop tests

## Key commands

| Command | Working dir | Purpose |
|---------|------------|---------|
| `bun run test` | `grading-server/` | Run server tests |
| `bun run test:watch` | `grading-server/` | Server tests in watch mode |
| `npm run test` | `ogre-desktop/` | Run desktop tests |
| `npm run test:watch` | `ogre-desktop/` | Desktop tests in watch mode |
| `npx vitest run <file>` | either | Run a specific test file |
| `npx vitest --reporter=verbose` | either | Verbose output |

## Notes

- Both workspaces use `vitest` but invoke it through their own package manager (`bun` vs `npm`).
- Test files follow `*.test.js` / `*.test.ts` naming.
- Server tests live in `grading-server/test/`.
- Desktop tests live in `ogre-desktop/tests/`.
