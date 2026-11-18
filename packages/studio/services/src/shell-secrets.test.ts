import { maxTokenNameLength } from "@halonicjs/adapter-secrets-tauri";
import { ServiceRegistry } from "@halonicjs/app";
import { tokenNamePrefix } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  provideShellSecrets,
  secretsKey,
  shellKeychain,
  shellKeyOrigins,
  tokenStoreKey,
} from "./shell-secrets.ts";
import { tauriIpc } from "./tauri-ipc.ts";

/** One command the page sent, with the name as it sent it. */
interface SentCall {
  readonly command: string;
  readonly name: string;
}

/**
 * A page in the shell whose keychain commands keep values in memory. Like the
 * shell, it matches names in lower case with `-` as `_`, and keeps a token
 * under the token prefix.
 */
function shellPage(): { page: object; keychain: Map<string, string>; calls: SentCall[] } {
  const keychain = new Map<string, string>();
  const calls: SentCall[] = [];
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    const name = String(args?.["name"]);
    calls.push({ command, name });
    const canonical = name.toLowerCase().replaceAll("-", "_");
    const stored = command.startsWith("token_") ? tokenNamePrefix + canonical : canonical;
    switch (command) {
      case "secret_set":
      case "token_set":
        keychain.set(stored, String(args?.["value"]));
        return null;
      case "secret_delete":
      case "token_delete":
        keychain.delete(stored);
        return null;
      default:
        return keychain.get(stored) ?? null;
    }
  };
  return { page: { __TAURI_INTERNALS__: { invoke } }, keychain, calls };
}

/** The services of a workspace opened in the shell. */
function openInShell(): {
  services: ServiceRegistry;
  keychain: Map<string, string>;
  calls: SentCall[];
} {
  const { page, keychain, calls } = shellPage();
  const services = new ServiceRegistry();
  expect(provideShellSecrets(services, page)).toBe(true);
  return { services, keychain, calls };
}

/** The same name in upper case, lower case, and with `-` and `_` swapped. */
function variants(name: string): string[] {
  const swapped = name.replace(/[-_]/g, (dash) => (dash === "-" ? "_" : "-"));
  return [name, name.toUpperCase(), name.toLowerCase(), swapped, swapped.toUpperCase()];
}

verifies("services.shell-secrets", () => {
  describe("provideShellSecrets", () => {
    it("gives the keychain as Secrets and TokenStore in the shell", async () => {
      const { services, keychain } = openInShell();
      keychain.set("openai_key", "example-key");

      await services.get(tokenStoreKey).set("google_refresh", "example-token");

      expect(await services.get(secretsKey).get("openai-key")).toBe("example-key");
      expect(await services.get(tokenStoreKey).get("google_refresh")).toBe("example-token");
      await services.get(tokenStoreKey).remove("google_refresh");
      expect(await services.get(tokenStoreKey).get("google_refresh")).toBeNull();
    });

    it("provides nothing outside the shell, and says so", () => {
      const services = new ServiceRegistry();

      expect(provideShellSecrets(services, {})).toBe(false);
      expect(services.has(secretsKey)).toBe(false);
      expect(services.has(tokenStoreKey)).toBe(false);
    });
  });

  describe("separate namespaces", () => {
    it("sends every token to the shell's token commands, so the same name as a secret finds nothing", async () => {
      const { services, keychain, calls } = openInShell();

      await services.get(tokenStoreKey).set("google_refresh", "example-token");

      expect(calls).toEqual([{ command: "token_set", name: "google_refresh" }]);
      expect([...keychain.keys()]).toEqual([`${tokenNamePrefix}google_refresh`]);
      expect(await services.get(secretsKey).get("google_refresh")).toBeNull();
    });

    it("refuses the token prefix and Halonic's own secrets as secret names, in every spelling", async () => {
      const { services, keychain, calls } = openInShell();
      keychain.set("token_key", "example-key");
      const reserved = [
        ...variants("halonic_token_google_refresh"),
        ...variants("token-key"),
        ...variants("serve_password"),
      ];

      for (const name of reserved) {
        const read = services.get(secretsKey).get(name);
        await expect(read).rejects.toThrow(RangeError);
        await expect(read).rejects.not.toThrow(name);
      }
      expect(calls).toEqual([]);
    });

    it("refuses a token name too long to fit once prefixed, without repeating it", async () => {
      const { services, keychain, calls } = openInShell();
      const longest = "t".repeat(maxTokenNameLength);
      const tooLong = "t".repeat(maxTokenNameLength + 1);

      await services.get(tokenStoreKey).set(longest, "example-token");
      const set = services.get(tokenStoreKey).set(tooLong, "example-token");

      await expect(set).rejects.toThrow(RangeError);
      await expect(set).rejects.not.toThrow(tooLong);
      expect(calls).toEqual([{ command: "token_set", name: longest }]);
      expect([...keychain.keys()]).toEqual([tokenNamePrefix + longest]);
      expect((tokenNamePrefix + longest).length).toBe(128);
    });
  });

  describe("shellKeychain", () => {
    it("is the keychain as it is, under the name it is given", async () => {
      const { page, keychain, calls } = shellPage();
      const ipc = tauriIpc(page);
      if (ipc === undefined) {
        throw new Error("The test page has no shell.");
      }
      const store = shellKeychain(ipc);

      await store.set("openai-key", "example-key");

      expect(await store.get("openai-key")).toBe("example-key");
      await store.remove("openai-key");
      expect(keychain.size).toBe(0);
      expect(calls).toEqual([
        { command: "secret_set", name: "openai-key" },
        { command: "secret_get", name: "openai-key" },
        { command: "secret_delete", name: "openai-key" },
      ]);
    });
  });

  describe("shellKeyOrigins", () => {
    it("reads a key's origins from the shell's secret_allowed_origins", async () => {
      const calls: { command: string; args: unknown }[] = [];
      const origins = shellKeyOrigins({
        invoke: async (command, args) => {
          calls.push({ command, args });
          return ["https://llm.example.com"];
        },
      });

      expect(await origins.allowedOrigins("openai-key")).toEqual(["https://llm.example.com"]);
      expect(calls).toEqual([{ command: "secret_allowed_origins", args: { name: "openai-key" } }]);
    });
  });
});
