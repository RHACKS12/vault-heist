# Contributing

## Branch workflow

`main` is the trunk and should always be green (tests pass). Nobody commits
features straight to `main`.

1. **Branch off `main`** for each piece of work:
   ```bash
   git checkout main && git pull
   git checkout -b feat/<short-name>
   ```
2. **Build + commit** on that branch, with clear messages.
3. **Run the tests** before merging — `npm test` must pass.
4. **Merge back into `main`** (and push):
   ```bash
   git checkout main
   git merge --no-ff feat/<short-name>
   git push origin main
   ```
   `--no-ff` keeps a visible merge commit per feature.

> The Claude-driven sessions develop on their assigned `claude/*` branch and
> merge that into `main` the same way. Treat `claude/*` branches as ordinary
> feature branches.

## Documenting your work

Every feature updates the record so the next person (or session) has context:

- **`docs/progress.md`** — add a dated entry: what shipped, key decisions, what's next.
- **`README.md` / `DESIGN.md`** — update the status table / any design that changed.
- **Code** — JSDoc on exported functions; a comment where the *why* isn't obvious.
- **Tests** — new behavior ships with a test in `server/test/`.

## Commit messages

- First line: imperative, ≤ ~72 chars (`Add read-only firmware sandbox tools`).
- Body: what changed and why, wrapped at ~72 chars.

## Running things

```bash
npm install     # once
npm test        # full suite (node:test)
npm start       # run the server
npm run demo    # server + a scripted phase cycle
```
