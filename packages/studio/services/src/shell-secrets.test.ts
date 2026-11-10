import { ServiceRegistry } from "@halonicjs/app";
import { tokenNamePrefix } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  maxShellTokenNameLength,
  provideShellSecrets,
  secretsKey,
  tokenStoreKey,
} from "./shell-secrets.ts";

/**
 * A page in the shell whose keychain commands keep values in memory. Like the
 * shell, it matches names in lower case with `-` as `_`.
 */
function shellPage(): { page: object; keychain: Map<string, string>; names: string[] } {
  const keychain = new Map<string, string>();
  const names: string[] = [];
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    const name = String(args?.["name"]);
    names.push(name);
    const canonical = name.toLowerCase().replaceAll("-", "_");
    switch (command) {
      case "secret_set":
        keychain.set(canonical, String(args?.["value"]));
        return null;
      case "secret_delete":
        keychain.delete(canonical);
        return null;
      default:
        return keychain.get(canonical) ?? null;
    }
  };
  return { page: { __TAURI_INTERNALS__: { invoke } }, keychain, names };
}

/** The services of a workspace opened in the shell. */
function openInShell(): {
  services: ServiceRegistry;
  keychain: Map<string, string>;
  names: string[];
} {
  const { page, keychain, names } = shellPage();
  const services = new ServiceRegistry();
  expect(provideShellSecrets(services, page)).toBe(true);
  return { services, keychain, names };
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
    it("stores every token under the prefix, so the same name as a secret finds nothing", async () => {
      const { services, names } = openInShell();

      await services.get(tokenStoreKey).set("google_refresh", "example-token");

      expect(names).toEqual([`${tokenNamePrefix}google_refresh`]);
      expect(await services.get(secretsKey).get("google_refresh")).toBeNull();
    });

    it("refuses the token prefix and Halonic's own secrets as secret names, in every spelling", async () => {
      const { services, keychain, names } = openInShell();
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
      expect(names).toEqual([]);
    });

    it("refuses a token name too long to fit once prefixed, without repeating it", async () => {
      const { services, names } = openInShell();
      const longest = "t".repeat(maxShellTokenNameLength);
      const tooLong = "t".repeat(maxShellTokenNameLength + 1);

      await services.get(tokenStoreKey).set(longest, "example-token");
      const set = services.get(tokenStoreKey).set(tooLong, "example-token");

      await expect(set).rejects.toThrow(RangeError);
      await expect(set).rejects.not.toThrow(tooLong);
      expect(names).toEqual([tokenNamePrefix + longest]);
      expect((tokenNamePrefix + longest).length).toBe(128);
    });
  });
});
