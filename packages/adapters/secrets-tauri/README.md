# @halonicjs/adapter-secrets-tauri

The `Secrets` and `TokenStore` ports for the Studio desktop app: every call goes to the shell's
`secret_get`, `secret_set` or `secret_delete` command, which keeps the value in the OS keychain
under the service `halonic`, the same entry the CLI uses.

- **Layer:** adapters
- **Owner:** priya
- **Runtime:** web (the app's own page in the Tauri window)
- **Public API:** `@halonicjs/adapter-secrets-tauri`

## Example

Store an API key, read it back under another spelling, remove it. The code lives in
[`examples/desktop-keychain.ts`](examples/desktop-keychain.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`, because a
package may not import itself by name; outside this package, import
`@halonicjs/adapter-secrets-tauri` as below. In the app, the shell is `window.__TAURI_INTERNALS__`;
the example passes a stand-in that keeps values in memory.

```ts
import { TauriSecrets, type TauriShell } from "@halonicjs/adapter-secrets-tauri";

/**
 * A stand-in for the desktop shell, which isn't there in a test: it keeps
 * values in memory under the canonical name, as the shell's keychain does.
 */
function exampleShell(): TauriShell {
  const keychain = new Map<string, string>();
  const canonical = (args?: Record<string, unknown>) =>
    String(args?.["name"]).toLowerCase().replaceAll("-", "_");
  return {
    invoke: async (command, args) => {
      if (command === "secret_set") {
        keychain.set(canonical(args), String(args?.["value"]));
        return null;
      }
      if (command === "secret_delete") {
        keychain.delete(canonical(args));
        return null;
      }
      return keychain.get(canonical(args)) ?? null;
    },
  };
}

/** Stores an API key, reads it back under another spelling, removes it, and never returns the key. */
export async function runExample(): Promise<{
  readBack: boolean;
  afterRemove: string | null;
}> {
  // In the desktop app this is `window.__TAURI_INTERNALS__`.
  const secrets = new TauriSecrets(exampleShell());
  const apiKey = "example-api-key"; // a made-up value; never print a real one

  await secrets.set("openai", apiKey);

  // Case and `-` versus `_` don't matter: the shell stores the canonical name.
  const readBack = (await secrets.get("OpenAI")) === apiKey; // true

  await secrets.remove("openai");
  const afterRemove = await secrets.get("openai"); // null

  return { readBack, afterRemove };
}
```

## Rules

The rules are the shell's (`apps/studio/src-tauri/crates/secrets`), so the page, the desktop
keychain and the Android Keystore (HAL-1211) never disagree:

- **Names** follow the `Secrets` port's rule. The adapter checks it too, so a bad name is a
  `RangeError` before anything is sent. The shell stores the name lower case with `-` as `_`.
- **Values** are checked by the shell only: not empty, at most 16 KiB, and at most what the
  platform's store holds (1,280 bytes in the Windows Credential Manager). A refused value is a
  `RangeError`.
- **Keychain failures** reject with a `KeychainError`. Its `refusal` is the shell's own kind, and
  its `kind` tells a surface how to respond:

  | refusal       | kind              | means                                                       |
  | ------------- | ----------------- | ----------------------------------------------------------- |
  | `unavailable` | `unavailable`     | there is no keychain, or it can't be reached                |
  | `denied`      | `denied`          | the user or the system refused access                       |
  | `unreadable`  | `unauthenticated` | the value can't be decrypted any more; the shell deleted it |
  | `backend`     | `unavailable`     | any other failure, including one the shell didn't describe  |

  An unreadable value is never `null`, so it never looks like "not set".

`KeychainRefusalKind` is the four refusals in the table; `RefusalKind` adds the shell's `invalid_name`
and `invalid_value`, which become a `RangeError`. `refusalKinds` lists all six, and `secretCommands`
names the three commands (`get`, `set`, `delete`).

No error holds a value. A failure that isn't the shell's own refusal (a missing capability, a
broken IPC call) keeps neither its text nor the original error, because the adapter can't vouch
for them. Only a plain object counts as the shell's refusal, as Tauri's IPC delivers it, and a
refusal whose message repeats the value being set loses its message.

The adapter doesn't take a reply on trust either. An answer that the shell never gives is a
`backend` refusal: `""` or anything else that isn't a value or `null` from `secret_get`, and
anything but `null` from `secret_set` or `secret_delete`.

## Limits

- **Secrets and tokens share one keychain service**, as they do in the CLI: a token and a
  configured secret with the same name are the same entry.
- **Only the app's own page** gets the commands (capability `desktop-secrets`, local only). The
  Studio a computer serves has no keychain, so it reads secrets through the server.
