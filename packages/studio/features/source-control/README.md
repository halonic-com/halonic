# @halonicjs/studio-feature-source-control

The Studio's Changes: what changed in the workspace since its last version, and later Create version, Discard, History and Get updates. It reads the open workspace's history from `ChangesSourceService`, which the app provides from the shell's `git` command.

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
| `ready`, files changed | for now a count of the changed files |

The sharing strip so far has one state: a folder with history and no remote says "Only on this computer" with **Add where to share**, a dialog for one git address (`https://`, `ssh://` or `user@host:path`, checked by `isShareAddress` before git is asked; requirement `source-control.share-address`). The address becomes the remote `origin`; the page then shows Get updates instead of the strip.

Before the first Create version of a workspace whose history has no name or email, **Who should versions be from?** asks for both (requirement `source-control.identity`). They are saved in the workspace's own git config through the shell's narrow `config user.name` / `config user.email` form, and `ChangesSource.readIdentity` reads what git would use, the person's own setting included.

Not here yet: History, the strip's other states and Share, the developer view and the phone layout. Each comes in its own pull request under HAL-1302.
