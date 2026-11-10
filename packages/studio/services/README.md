# @halonicjs/studio-services

The Studio's platform bridges: the services that come from the shell the Studio runs in. Today that
is the OS keychain in the desktop app, given to a workspace's services as its `Secrets` and
`TokenStore`. The plan (section 5.5) adds the React side of the service registry, the web and
served bridges, the run event stream and settings storage here later.

- **Layer:** studio
- **Owner:** priya
- **Public API:** `@halonicjs/studio-services`

It is the only Studio package that may use an adapter (`adapterGateways` in
`tooling/check/policy.json`).

## Example

Open a workspace's services in the shell, store a token, read it back, and see that a secret of the
same name is not the token. The code lives in
[`examples/desktop-secrets.ts`](examples/desktop-secrets.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`, because a
package may not import itself by name. In the app, the page is `window`; the example passes a
stand-in whose shell keeps values in memory.

```ts
import { ServiceRegistry } from "@halonicjs/app";
import { provideShellSecrets, secretsKey, tokenStoreKey } from "@halonicjs/studio-services";

/**
 * A stand-in for the desktop app's page, which isn't there in a test: its
 * shell keeps values in memory, as the shell's keychain does.
 */
function examplePage(): object {
  const keychain = new Map<string, string>();
  return {
    __TAURI_INTERNALS__: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        const name = String(args?.["name"]);
        switch (command) {
          case "secret_set":
            keychain.set(name, String(args?.["value"]));
            return null;
          case "secret_delete":
            keychain.delete(name);
            return null;
          default:
            return keychain.get(name) ?? null;
        }
      },
    },
  };
}

/** Opens a workspace's services in the shell, stores a token and reads it back. */
export async function runExample(): Promise<{
  inShell: boolean;
  readBack: boolean;
  asSecret: string | null;
}> {
  const services = new ServiceRegistry();
  // In the app this is `window`.
  const inShell = provideShellSecrets(services, examplePage()); // true

  const token = "example-token"; // a made-up value; never print a real one
  await services.get(tokenStoreKey).set("google_refresh", token);
  const readBack = (await services.get(tokenStoreKey).get("google_refresh")) === token; // true

  // Tokens have their own namespace: the same name as a secret is not the token.
  const asSecret = await services.get(secretsKey).get("google_refresh"); // null

  return { inShell, readBack, asSecret };
}
```

## Tauri's internal object

The shell puts its IPC on the page as `window.__TAURI_INTERNALS__`. That is Tauri's internal object,
not a public API, so only `tauriIpc` (`src/tauri-ipc.ts`) reads it, and the rest of the Studio,
including the Android connect page, asks `tauriIpc`. If a Tauri upgrade moves it, `tauriIpc` throws
an error naming itself instead of running as if outside the shell, and the fix is one line there.

## Limits

- Outside the shell `provideShellSecrets` provides nothing and returns `false`. The browser and
  `serve` stores come with their bridges.
- Secrets and tokens share the one keychain service `halonic`, but not their names. Every token is
  stored under the prefix `halonic_token_`, and the `Secrets` refuse that prefix and Halonic's own
  `token-key` and `serve-password`, in any case and with `-` or `_`. So a workspace can't read a
  token, or the secrets Halonic keeps for itself, by picking its name as a secret.
- A token name may be at most 114 characters here, so that it still fits the keychain's 128 once
  prefixed. Longer names are refused with a `RangeError`.
