# @halonicjs/adapter-fs-tauri

The `TrustStore` port for the Studio desktop app: every call goes to the shell's `trust_get`,
`trust_list`, `trust_grant` or `trust_revoke` command. The shell keeps the records in the `trust`
folder of the profile, laid out as `FileTrustStore` in `fs-node` lays it out, so the CLI and the
desktop app read and write the same records.

- **Layer:** adapters
- **Owner:** priya
- **Runtime:** web (the app's own page in the Tauri window)
- **Public API:** `@halonicjs/adapter-fs-tauri`

## Who opens a folder

Trust and the folders git may use are one list. A grant that the shell saves also adds its folder to
the shell's opened folders (`OpenedFolders` in `crates/git-guard`), the only places git and the file
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

| The shell says      | The adapter rejects with                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `unreadable`        | an `Error` naming the record's location (or its file, when the shell can't read the location), as `FileTrustStore` throws it |
| `declined`          | a `KindedError` `denied`                                                                                                     |
| `busy`              | a `KindedError` `conflict`                                                                                                   |
| `folder_unreadable` | a `KindedError` `not_found`                                                                                                  |
| `invalid_record`    | a `KindedError` `internal`                                                                                                   |
| `io`                | a `KindedError` `unavailable`, with the shell's message                                                                      |
| anything else       | a `KindedError` `unavailable`, without its text                                                                              |

The shell's refusals have the shape `{ kind, message, location?, file? }`. The package exports
`trustCommands` (the four command names), `trustRefusalKinds` and `isTrustRefusal`, which tells a refusal
from an IPC or permission failure. A page without the `desktop-trust` capability, such as the served
Studio, gets the last row: `unavailable`, and the text of its failure is dropped.

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
