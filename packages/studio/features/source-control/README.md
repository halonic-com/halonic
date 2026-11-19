# @halonicjs/studio-feature-source-control

The Studio's Changes: what changed in the workspace since its last version, What changed and its undo, Create version, History, sharing and Get updates, on desktop and phone. It reads and writes the open workspace's history through `ChangesSourceService`, which the app provides from the shell's `git` command.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-source-control` (the feature) and `@halonicjs/studio-feature-source-control/api`

## Example

```ts
import { ChangesSourceService } from "@halonicjs/studio-feature-source-control/api";

const source = context.services.get(ChangesSourceService);
await source.read();
// { kind: "ready", changes: [{ path: "hubs/sales/hub.yaml", status: "modified", staged: false }] }
// or { kind: "not-a-repository" }, or { kind: "no-git" }
```

## The Changes page

The feature keeps one `ChangesList` per open workspace, from `ChangesSourceService`. The Changes place's page and the sidebar's count ("Changes, 3 changes", nothing at zero) read it, so they change together (requirement `source-control.changes-page`). The list reads again when the window comes to the front and when a workspace file changes, and a read that fails later keeps what the page showed.

The page shows one of these, by what the last read said:

| Read | The page says |
| --- | --- |
| first read still working | skeleton rows, "Loading changes", after 300 ms |
| first read failed | "Couldn't load changes", the reason, Try again |
| `not-a-repository` | "Keep a history of your work", **Turn on history** (adds `.studio/` to `.gitignore`, then `git init`) |
| `no-git` | "Halonic needs git to keep versions.", How to install git, **Check again** |
| `ready`, nothing changed | "Nothing has changed since your last version." |
| `ready`, files changed | the list of changed items, then History |

## What the feature does

Each part has its own requirement in `requirements/`; the file name is the part after `source-control.`.

- **The list** (`change-list`): one row per changed item with its icon, name and one sentence; files no kind places are under "Other files". Each row has a ⋮ with Open and **Undo these changes**. The list draws 200 rows, then "and N more".
- **What changed** (`whats-changed-page`, `changed-words`, `cant-describe`, `line-diff`): a row opens its own page with Back to Changes, **Undo these changes** and Open. Each change is put in words with CHANGED, ADDED or REMOVED and before → after; Advanced shows the line diff. A file Halonic can't put in words gets one label and Advanced open.
- **Undo** (`discard`): every undo happens at once, keeps a copy in `.studio/` first and offers **Undo** in the toast. When a file fails, the files already put back are rolled back, newest first; only when that roll-back fails too does a warning Callout list what is still changed, with Try again.
- **Create version** (`create-version`, `identity`): a dialog with an offered name, notes and what's in it, Ctrl+Enter to create. Before the first version of a workspace with no name or email, **Who should versions be from?** asks for both and saves them in the workspace's own git config.
- **History** (`history`, `history-page`, `history-not-shared`): the newest 20 versions that touch the workspace folder, grouped by day, with Show more and each version's details.
- **Sharing** (`share-address`, `share-versions`): with no remote, "Only on this computer" and **Add where to share** (one git address, which becomes `origin`). With one, the strip says how many versions aren't shared yet and offers **Share**, or "Up to date", or "Couldn't check for updates". Push is never forced.
- **Get updates** (`get-updates`, `get-updates-per-item`): brings in the shared copy's newer versions when only it is ahead. When both sides are ahead, the merge starts without touching a file, and the person picks Keep mine, Use Sam's (the teammate's name) or Keep both per item.
- **Phone** (`changes-phone`, `whats-changed-phone`): the same page in one column. History shows the newest 5 and See all history, rows carry chevrons and a **Not shared yet** chip, and What changed, a version and Get updates each open as their own page with a bottom bar.

## Not here yet

Each comes in its own pull request under HAL-1302: Restore just this and Go back to this version in History, Share with your team right away in Create version, who changed an item and when, the tests line in Create version, the developer view's stage, commit box and branch picker, and the browser demo's "History needs the desktop app.".
