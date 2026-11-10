import { ServiceRegistry } from "@halonicjs/app";
import { provideShellSecrets, secretsKey, tokenStoreKey } from "../src/index.ts";

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
