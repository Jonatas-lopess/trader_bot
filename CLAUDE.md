# trader_bot

## Directives

- All commits must follow the conventional commit format; Only fixes must have a commit body, other types must not have one; never add a co-author to the commit.
- `PLANNING.md` is the technical contract: read it before architecture or dependency work. It is binding until changed there.

## Agent skills

### Issue tracker

Issues live as local markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary, label strings equal to role names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### TODO index

`TODO.md` at repo root indexes all `.scratch/` tickets by effort, plus untracked backlog.

### Content files

Content lives in typed content files under `src/content/`, never inline strings in
markup, plus the `launchBlocking` marker for copy that ships but isn't launch-approved.
See `docs/agents/content-files.md`.
