# @halonicjs/adapter-watch-kit

The `watch()` that file-based `DefinitionStore`s share. Their sources can only say which entries
_may_ have changed: `node:fs.watch` in `fs-node`, the desktop shell's messages in `fs-tauri`, the
page getting focus again in `fs-web`. The kit reads those entries, compares each file's digest with
the one it last saw, and reports only the files whose text really differs.

- **Layer:** adapters
- **Owner:** priya
- **Runtime:** any (Web-standard types only, no `node:` imports)
- **Public API:** `@halonicjs/adapter-watch-kit`

## Public API

- `DigestWatch` implements the port's `DefinitionWatch`. `DigestWatch.open(options, listener)`
  starts the event source, then reads the digest of every file, so a change made while it reads is
  not missed. The options:
  - `files`: the store's read side (`list` and `read`). A path it refuses with a `RangeError`, as a
    store refuses a linked path, counts as having no file.
  - `digest`: the SHA-256 to hash with (`Sha256` from `@halonicjs/std`).
  - `events`: a `WatchEvents` function, the store's source of names (below).
  - `quietMs`: how long the source stays quiet before a batch is read.
  - `isScratch` (optional): names the store only writes on the way to a file, such as a temporary
    file it renames into place. They are never reported.
  - `openWatches`: the store's set of open watches. The watch joins it before it first reads the
    workspace, so it hears about the store's changes from then on, and takes itself out when it
    closes or fails. A change the store started before the watch joined can be reported once.
- `WatchEvents` is `(noticed, failed) => stop`. The source calls `noticed(name)` with a workspace
  path (with `/`) that may have changed, or `""` when it can't say which, so every file is checked.
  It calls `failed(error)` when it breaks; the listener hears that once and nothing more after.
- Around each of its own writes and removes, the store calls `beginOwnChange(path, change)` with
  the new text's digest (or `"absent"`), then `endOwnChange(path, applied)` once it is over. A
  batch read in between leaves the file out when it holds what the store is writing. When the
  change was `applied`, the watch takes that digest as seen without reading the file again, so a
  change from outside right after it is still reported; when it failed, the watch reads the file
  back. The first reading, batches and `endOwnChange` run one at a time, in order.
  `endOwnChange` never rejects: a failure to read the file back breaks the watch, not the write.
- `KnownFiles` is the part without timers or events: the digests last seen, the own-change marks,
  and `changesAt(names)`, which gives the sorted batch. `OwnChange` and `KnownFilesOptions` are its
  types.

Private entries (`.git`, `.env`, the Studio's run logs) never start a batch or read the workspace.

## Example

```ts
import { DigestWatch } from "@halonicjs/adapter-watch-kit";

const watches = new Set<DigestWatch>();
const watch = await DigestWatch.open(
  {
    files: store,
    digest,
    // The page has no file events: check every file when it gets focus again.
    events: (noticed) => {
      const onFocus = () => noticed("");
      window.addEventListener("focus", onFocus);
      return () => window.removeEventListener("focus", onFocus);
    },
    quietMs: 0,
    openWatches: watches,
  },
  { changed: (batch) => console.log(batch), failed: (error) => console.error(error) },
);
```
