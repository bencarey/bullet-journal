# bujo-sync — canonical journal bridge for a local agent

Supabase is the **single source of truth** for the Bullet Journal (one Markdown
row per user in `public.journal`, protected by Row-Level Security). The desktop
app mirrors saves to a local `journal.md`, but that mirror can go **stale** when
you edit from another device (phone/browser edits go straight to Supabase). So a
reviewing agent should never trust a loose file — it should `pull` from Supabase.

This tool gives the agent one canonical read/write path against the source.

## Commands

```
node bujo-sync.js pull      # Supabase -> journalPath  (always the latest)
node bujo-sync.js push      # journalPath -> Supabase  (after the agent edits)
node bujo-sync.js whoami    # verify auth
```

`push` has a **clobber guard**: if the remote row changed since your last
`pull` (i.e. you edited on another device in between), it refuses and tells you
to `pull` first. Override with `push --force` only if you're sure.

## One-time setup

```bash
# 1) point the tool at your account + the file the agent reads/writes
node bujo-sync.js setup \
  --email you@example.com \
  --file "/Users/you/.../Personal Assistant/journal.md"

# 2) store your Supabase password in the macOS Keychain (never in a file)
security add-generic-password -s bujo-supabase -a "you@example.com" -w

# 3) verify
node bujo-sync.js whoami
```

The Supabase endpoint + publishable key are read from the app's `../config.js`.
`config.json`, `.session.json`, and `.last-sync.json` are git-ignored (they hold
your email, cached tokens, and sync state).

## The agent's workflow

Every review cycle:

1. **`pull`** — refresh `journalPath` with the latest from Supabase.
2. Read / edit `journalPath` (see format below).
3. **`push`** — write it back. The app picks it up on its next sync.

## Markdown format (must round-trip cleanly)

The file the app parses looks like:

```markdown
# Journal

<!-- title: JOURNAL -->
<!-- updated: 2026-07-06T15:00:00.000Z -->

## Daily

### 2026-07-06
- [ ] An open task
- [x] A completed task
- [>] A migrated task
- [~] A cancelled task
- ★ A priority task            (done: - [x] ★ ...)
- ○ An event
- — A note
- ! An idea

### 2026-07-05
- [ ] ...

## Monthly
### 2026-07
- [ ] ...

## Future
### 2026-08
- [ ] ...

## Collections
### Reading list
- — ...
```

Rules the agent must follow so the app doesn't reject or reformat entries:

- Sections are `## Daily | Monthly | Future | Collections`; day buckets are
  `### YYYY-MM-DD` (newest-first in Daily/Monthly).
- Every entry is a `- ` list item. Task status is the checkbox char:
  `[ ]` open · `[x]` done · `[>]` migrated · `[~]` cancelled · `[<]` scheduled.
- Non-task glyphs: `★` priority, `○` event, `— ` note, `! ` idea.
- `#personal` anywhere in an entry's text puts it in the **Personal** group of
  the app's Day view; everything else is **Work**. Preserve tags in the text.
- Keep the `<!-- title -->` / `<!-- updated -->` comments intact.
