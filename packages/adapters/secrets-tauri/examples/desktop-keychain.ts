import { TauriSecrets, type TauriShell } from "../src/index.ts";

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
