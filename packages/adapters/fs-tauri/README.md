# @halonicjs/adapter-fs-tauri

The `TrustStore`, `RunStore`, `BlobStore`, `RecordStore`, `DefinitionStore` and `HostSettingsStore` ports for the Studio desktop app.

- `TauriTrustStore`: every call goes to the shell's `trust_get`, `trust_list`, `trust_grant` or
  `trust_revoke` command. The shell keeps the records in the `trust` folder of the profile, laid out
  as `FileTrustStore` in `fs-node` lays it out, so the CLI and the desktop app read and write the
  same records.
- `TauriRunStore`: every call goes to the shell's `run_append`, `run_events`, `run_snapshot` or
  `run_logs` command. The shell keeps the runs in the profile's run folder for the workspace, laid
  out as `FolderRunStore` in `fs-node` lays it out, and holds the run's lock file while it appends,
  so of a CLI and the desktop app appending with the same `expectedSeq`, exactly one wins. `list`
  keeps each run's summary by its log's stamp, so the shell sends only the logs that changed.
- `TauriBlobStore`: every call goes to the shell's `blob_put` or `blob_get` command. The shell
  keeps the blobs in the profile's blob folder for the workspace, laid out as `FolderBlobStore` in
  `fs-node` lays it out, so a blob one of them stored is there for the other.
- `TauriRecordStore`: every call goes to the shell's `record_append`, `record_read` or
  `record_replace` command. The shell keeps the collections in the profile's record folder for the
  workspace, laid out as `FileRecordStore` in `fs-node` lays it out, under the same write lock, so a
  collection changed on desktop is there for `halonic serve`.
- `TauriDefinitionStore`: every call goes to the shell's `fs_list`, `fs_read`, `fs_write` or
  `fs_remove` command, on the plain files of a folder the person opened, the files the CLI's
  `FolderDefinitionStore` reads and writes. `watch()` hears the shell's `fs_watch`.
- `TauriHostSettingsStore`: every call goes to the shell's `host_settings_read`,
  `host_settings_set` or `host_settings_remove` command. The shell keeps the settings in the
  profile's `settings/host.json`, as `FileHostSettingsStore` in `fs-node` keeps them, so the CLI and
  the desktop app share them. See [Host settings](#host-settings).

- **Layer:** adapters
- **Owner:** priya
- **Runtime:** web (the app's own page in the Tauri window)
- **Public API:** `@halonicjs/adapter-fs-tauri`

## Who opens a folder

Trust and the folders git may use are one list. A grant that the shell saves also adds its folder to
the shell's opened folders (`OpenedFolders` in `apps/studio/src-tauri/crates/git-guard`), the only places git and the file
commands work.

The page never decides which folder that is. The shell saves a grant only for a folder the person
chose in the shell itself:

- a folder inside one they picked in the shell's folder dialog is saved at once;
- for any other folder, the shell asks them, showing the folder's real path, and saves nothing if
  they say no. The grant then rejects with a `denied` error. A folder a grant opened doesn't count
  as picked, so a folder inside it is asked about again.
- the shell asks about one folder at a time. A grant that arrives while it is asking rejects with a
  `conflict` error, so the page can't stack questions.

A revoke deletes the record and closes the folder at once: git and the file commands refuse it
from then on.

## Errors

| The shell says | The adapter rejects with |
| --- | --- |
| `unreadable` | an `Error` naming the record's location (or its file, when the shell can't read the location), as `FileTrustStore` throws it |
| `declined` | a `KindedError` `denied` |
| `busy` | a `KindedError` `conflict` |
| `folder_unreadable` | a `KindedError` `not_found` |
| `invalid_record` | a `KindedError` `internal` |
| `io` | a `KindedError` `unavailable`, with the shell's message |
| anything else | a `KindedError` `unavailable`, without its text |

The shell's refusals have the shape `{ kind, message, location?, file? }`. The package exports
`TauriShell` (the `invoke` the adapter needs), `trustCommands` (the four command names),
`trustRefusalKinds`, the types `TrustRefusal` and `TrustRefusalKind`, and `isTrustRefusal`, which
tells a refusal from an IPC or permission failure. A page without the `desktop-trust` capability, such as the served
Studio, gets the last row: `unavailable`, and the text of its failure is dropped.

## Runs

`new TauriRunStore(shell, workspace, { deployment, onSnapshotError })` names the run folder by the
workspace, a folder the person opened in the shell, and optionally a deployment. The shell works out
the folder as `runsFolder` in `@halonicjs/profile` does, and refuses a workspace that isn't open in
it. The page never names a path.

| Runs | Folder |
| --- | --- |
| the workspace's own | `<profile>/workspaces/<key>/runs` |
| one deployment's (`<id>`) | `<profile>/workspaces/<key>/deployments/<id>/runs` |

The deployment id becomes a folder name, so the constructor throws a `RangeError` for one that
`isDeploymentId` in `@halonicjs/profile` refuses, and the shell checks it with the same rule.

Only the file work happens in the shell (`apps/studio/src-tauri/crates/run-store`). Everything else happens here, with the
`RunStore` port's rules that `fs-node` uses too: checking an append and the run id, writing events
as log lines (`formatLogLines`) and reading them back (`parseLogLines`), the snapshot's `seq`, and
the summaries `list` works out on every call. A snapshot the shell couldn't write doesn't fail the
append; its reason goes to `onSnapshotError`, which must not throw. A stored snapshot that isn't one,
or is ahead of the log, reads as `null`, so the engine replays the log.

| The shell says | The adapter rejects with |
| --- | --- |
| `broken_log` | an `Error` with the shell's message, as `FolderRunStore` throws |
| `folder_not_open` | a `KindedError` `denied` |
| `invalid_deployment` | a `KindedError` `internal` (the page checks deployment ids first) |
| `invalid_run_id` | a `KindedError` `internal` (the page checks run ids first) |
| `invalid_lines` | a `KindedError` `internal` (the page writes the lines) |
| `other_runs_log` | a `KindedError` `invalid_input` (a run id in another case, HAL-4749) |
| `io` | a `KindedError` `unavailable`, with the shell's message |
| anything else | a `KindedError` `unavailable`, without its text |

An answer that isn't the command's also rejects with `unavailable`, without text.

The package exports `TauriRunStore`, `TauriRunStoreOptions`, `runCommands`, `runRefusalKinds`, the
types `RunRefusal` and `RunRefusalKind`, and `isRunRefusal`. The tests run the run-store
contract against a fake shell; that the shell and the CLI take turns on one lock is proved on real
files by the Rust tests of `crates/run-store` and `crates/run-lock` (in `apps/studio/src-tauri`).

## Blobs

`new TauriBlobStore(shell, workspace)` names the blob folder by the workspace, a folder the person
opened in the shell. The shell works out the folder as `blobsFolder` in `@halonicjs/profile` does,
`<profile>/workspaces/<key>/blobs`, and keeps each blob as the file `<first two hex
characters>/<hash>`, holding only the bytes, as `FolderBlobStore` does. The page never names a path.

The media type and the hash are checked here with the port's rules (`checkBlobMediaType`,
`isBlobHash`), so a refused call never reaches the shell. Bytes cross the IPC as strict base64url
(`encodeBase64url` in `@halonicjs/std`), and the shell hashes them itself, so a blob's file always
holds the bytes its name says. The media type isn't kept, as the port allows.

| The shell says | The adapter rejects with |
| --- | --- |
| `linked_blob` | an `Error` with the shell's message, as `FolderBlobStore` throws for a linked blob |
| `folder_not_open` | a `KindedError` `denied` |
| `invalid_hash`, `invalid_data` | a `KindedError` `internal` (the page checks hashes and encodes the bytes) |
| `io` | a `KindedError` `unavailable`, with the shell's message |
| anything else | a `KindedError` `unavailable`, without its text |

An answer that isn't the command's also rejects with `unavailable`, without text.

The package exports `TauriBlobStore`, `blobCommands`, `blobRefusalKinds`, the types `BlobRefusal`
and `BlobRefusalKind`, and `isBlobRefusal`. The tests run the blob-store contract against a fake
shell; the layout, the private modes and the link refusals on real files are proved by the Rust
tests of `crates/blob-store` (in `apps/studio/src-tauri`).

## Collections

`new TauriRecordStore(shell, workspace)` names the record folder by the workspace, a folder the
person opened in the shell. The shell works out the folder as `recordsFolder` in
`@halonicjs/profile` does, `<profile>/workspaces/<key>/records`, and keeps each collection's log as
`FileRecordStore` does: named by the SHA-256 of the collection, one JSON change per line, every
write under `write.lock`. The page names collections, never paths.

Only the file work happens in the shell (`apps/studio/src-tauri/crates/record-store`). Writing
changes as lines (`formatRecordLines`), reading them back (`parseRecordLines`) and folding a
collection (`compactedChanges`) happen here, with the `RecordStore` port's rules that `fs-node` uses
too. A compact reads the log with its version, folds it, and has the shell replace the log only while
it still has that version. When a change came in between, it reads and folds again; after five tries
it rejects with `conflict`.

| The shell says | The adapter rejects with |
| --- | --- |
| `broken_log`, `linked_log` | an `Error` with the shell's message, as `FileRecordStore` throws |
| `folder_not_open` | a `KindedError` `denied` |
| `invalid_lines` | a `KindedError` `internal` (the page writes the lines) |
| `io` | a `KindedError` `unavailable`, with the shell's message |
| anything else | a `KindedError` `unavailable`, without its text |

An answer that isn't the command's also rejects with `unavailable`, without text.

The package exports `TauriRecordStore`, `recordCommands`, `recordRefusalKinds`, the types
`RecordRefusal` and `RecordRefusalKind`, and `isRecordRefusal`. The tests run the record-store
contract against a fake shell; the files, the lock and the link refusals on real files are proved by
the Rust tests of `crates/record-store`.

## Workspace files

`new TauriDefinitionStore(shell, workspace)` serves the files of `workspace`, a folder the person
opened in the shell. `shell` is a `TauriFileShell`: the shell's `invoke` plus `openChannel`, which
the Studio builds from `window.__TAURI_INTERNALS__` and its own `TauriChannel`, so this package
needs no Tauri library.

Paths are checked here with the port's rules before the shell is called, and the shell checks them
again, since the page isn't trusted; it also refuses any path through a link, which only it can see.
A write with `expected` is compared and renamed into place in the shell, under a lock it holds for
each file, so nothing can come between the check and the write. `version()` is worked out here from
`fs_list` and `fs_read`, as `fs-node` does.

`fs_watch` only says which files may have changed. The store reads each one and reports it only
when its digest differs from the one it last saw, so its own writes and removes, and a file saved
again with the same text, are never reported. That digest-compare watch is `DigestWatch` from
`@halonicjs/adapter-watch-kit`, the one `fs-node` and `fs-web` use too; this package only turns the
shell's channel into its events. A finished write is taken as seen without reading it back, so a
change from outside right after it is still reported.

| The shell says | The adapter rejects with |
| --- | --- |
| `unsafe_path`, `private_path` | a `RangeError`, as the port asks (a link in the path) |
| `folder_unreadable` | an `UnreadableWorkspaceFolderError` naming the folder |
| `folder_not_open` | a `KindedError` `denied` |
| `not_text` | a `KindedError` `invalid_input` |
| `io` | a `KindedError` `unavailable`, with the shell's message |
| anything else | a `KindedError` `unavailable`, without its text |

The package exports `TauriDefinitionStore`, `TauriFileShell`, `TauriChannelHandle`,
`fileCommands`, `fileRefusalKinds`, the types `FileRefusal` and `FileRefusalKind`, and
`isFileRefusal`. The tests run the definition-store contract against a fake shell; the comparing,
the rename and the link checks on real files are proved by the Rust tests of the file commands
(in `apps/studio/src-tauri`).

## Host settings

`new TauriHostSettingsStore(shell)` keeps the settings kept where Halonic runs: the assistant and the
sandbox default, for every workspace on this computer. The page gives a key and a value, never a
path; the shell (`apps/studio/src-tauri/crates/host-settings`) finds `host.json` in the CLI's
profile, keeps the file rules and lets saves from every window take turns.

The adapter checks a save with the port's own rules before it calls the shell: IPC sends JSON, which
turns a number that isn't finite into `null`, so only the page can refuse it. The shell checks the
key and the size again, with the other saved keys.

The shell has no file watch. `watch()` reads the settings once, then every 2 seconds
(`hostSettingsPollMs`) while it is open and right after each save through the store, and calls the
listener only when they differ from the last read, compared as canonical JSON. A read that fails is
told once, as a change, so the caller reads again and hears the error.

| The shell says | The adapter rejects with |
| --- | --- |
| `invalid_key`, `too_large` | a `RangeError`, as the port asks |
| `unreadable` | an `Error` with the shell's message, as `FileHostSettingsStore` throws (a link, or a file the system won't read) |
| `io` | a `KindedError` `unavailable`, with the shell's message |
| anything else | a `KindedError` `unavailable`, without its text |

An answer that isn't the settings also rejects with `unavailable`. The package exports
`TauriHostSettingsStore`, `TauriHostSettingsStoreOptions`, `hostSettingsPollMs`,
`hostSettingsCommands`, `hostSettingsRefusalKinds`, the types `HostSettingsRefusal` and
`HostSettingsRefusalKind`, and `isHostSettingsRefusal`. The tests run the host settings contract
against a fake shell; the file rules on real files are proved by the Rust tests of
`crates/host-settings`.

## Example

Trust a workspace, read it back, list it and revoke it. The code lives in
[`examples/desktop-trust.ts`](examples/desktop-trust.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`, because a
package may not import itself by name; outside this package, import `@halonicjs/adapter-fs-tauri`
as below. In the app, the shell is `window.__TAURI_INTERNALS__`; the example passes a stand-in that
keeps records in memory.

```ts
import { type TauriShell, TauriTrustStore } from "@halonicjs/adapter-fs-tauri";

/**
 * A stand-in for the desktop shell, which isn't there in a test: it keeps
 * records in memory by location. The real shell keeps them in the profile's
 * `trust` folder, and saves a grant only for a folder the person chose.
 */
function exampleShell(): TauriShell {
  const records = new Map<string, unknown>();
  return {
    invoke: async (command, args) => {
      if (command === "trust_grant") {
        const record = args?.["record"] as { location: string };
        records.set(record.location, record);
        return null;
      }
      if (command === "trust_revoke") {
        records.delete(String(args?.["location"]));
        return null;
      }
      if (command === "trust_list") {
        return [...records.values()];
      }
      return records.get(String(args?.["location"])) ?? null;
    },
  };
}

/** Trusts a workspace, reads the record back, lists it and revokes it. */
export async function runExample(): Promise<{
  fingerprint: string | undefined;
  listed: string[];
  afterRevoke: unknown;
}> {
  // In the desktop app this is `window.__TAURI_INTERNALS__`.
  const store = new TauriTrustStore(exampleShell());

  await store.grant({
    location: "/workspaces/acme",
    fingerprint: "hfp1:9f86d081",
    content: { programs: [] },
    grantedAt: "2026-11-10T10:00:00.000Z",
    appVersion: "0.1.0",
    pins: {},
    origin: "prompt",
  });

  const fingerprint = (await store.get("/workspaces/acme"))?.fingerprint; // "hfp1:9f86d081"
  const listed = (await store.list()).map((record) => record.location); // ["/workspaces/acme"]

  await store.revoke("/workspaces/acme");
  const afterRevoke = await store.get("/workspaces/acme"); // null

  return { fingerprint, listed, afterRevoke };
}
```
