# Bullet Journal

A minimal Mac app for keeping a bullet journal. Reads and writes a plain `.md` file — no database, no cloud sync required. Works with any file synced via Google Drive, Dropbox, etc.

## Features

- Daily, Monthly, Future, and Collections logs
- Priority items (★) with migration support
- Drag-and-drop reordering within a day
- Schedule tasks to specific future dates
- Done tab showing completed items and notes
- Confetti on task completion 🎉
- Subtle day summaries (open / completed / migrated)

## Install

1. Download `BulletJournal.dmg` from the [latest release](../../releases/latest)
2. Open the DMG and drag **Bullet Journal** to **Applications**
3. Open **Terminal** and run:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Bullet Journal.app"
   ```
4. Double-click **Bullet Journal** in Applications
5. Select your `journal.md` file when prompted

> **Note:** The app is ad-hoc signed but not notarized (no Apple Developer account). Step 3 removes the macOS quarantine flag that blocks unsigned apps — it's a one-time step per machine. Without it, macOS 26 will silently refuse to launch the app.

## Data format

The journal is stored as a plain Markdown file. Example:

```md
# Journal

<!-- title: BULLET JOURNAL -->

## Daily

### 2026-05-18
- [ ] Open task
- [x] Completed task
- ★ Priority item
- [>] ★ Migrated priority
- [<] Scheduled task

## Monthly
## Future
## Collections
```

## Development

```bash
npm install
npm start
```

Requires Node.js and npm.

## Build

```bash
npx @electron/packager . "Bullet Journal" --platform=darwin --arch=arm64 --electron-version=42.1.0 --overwrite --out=dist
```
