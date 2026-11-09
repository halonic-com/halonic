import { secretsContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type Environment, EnvSecrets } from "./env-secrets.ts";

/** The environment a user would set for `values`, written out independently of the adapter. */
function environmentFor(values: Readonly<Record<string, string>>): Environment {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      `HALONIC_SECRET_${name.toUpperCase().replaceAll("-", "_")}`,
      value,
    ]),
  );
}

/**
 * Wraps an environment so a test can see every variable the adapter looked at,
 * however it looked: reading it, testing for it, or listing every variable.
 */
function watched(environment: Environment): { environment: Environment; looked: string[] } {
  const looked: string[] = [];
  const proxy = new Proxy(environment, {
    get(target, key, receiver) {
      looked.push(String(key));
      return Reflect.get(target, key, receiver);
    },
    has(target, key) {
      looked.push(String(key));
      return Reflect.has(target, key);
    },
    getOwnPropertyDescriptor(target, key) {
      looked.push(String(key));
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    ownKeys(target) {
      looked.push("(every variable)");
      return Reflect.ownKeys(target);
    },
  });
  return { environment: proxy, looked };
}

secretsContract("env", async (values) => new EnvSecrets(environmentFor(values)));

verifies("env-secrets.environment-variables", () => {
  describe("EnvSecrets", () => {
    it("reads HALONIC_SECRET_ and the name in upper case, with - as _", async () => {
      const secrets = new EnvSecrets({ HALONIC_SECRET_SERVE_PASSWORD: "hash" });
      for (const name of ["serve-password", "SERVE_PASSWORD", "serve_password"]) {
        expect(await secrets.get(name), name).toBe("hash");
      }
    });

    it("gives null for an unset or empty variable", async () => {
      const secrets = new EnvSecrets({ HALONIC_SECRET_EMPTY: "", HALONIC_SECRET_UNSET: undefined });
      expect(await secrets.get("empty")).toBeNull();
      expect(await secrets.get("unset")).toBeNull();
      expect(await secrets.get("missing")).toBeNull();
    });

    it("keeps a value as it is, spaces included", async () => {
      const secrets = new EnvSecrets({ HALONIC_SECRET_SPACED: " value " });
      expect(await secrets.get("spaced")).toBe(" value ");
    });

    it("refuses a bad name before it reads any variable", async () => {
      const { environment, looked } = watched({ HALONIC_SECRET_BAD_NAME: "x" });
      await expect(new EnvSecrets(environment).get("bad name")).rejects.toThrow(RangeError);
      expect(looked).toEqual([]);
    });

    it("reads only the environment's own variables, not one on Object.prototype", async () => {
      const prototype = Object.prototype as Record<string, unknown>;
      prototype["HALONIC_SECRET_POLLUTED"] = "from-prototype";
      try {
        expect(await new EnvSecrets({}).get("polluted")).toBeNull();
      } finally {
        delete prototype["HALONIC_SECRET_POLLUTED"];
      }
    });

    it("sees a variable set after it was made, like process.env", async () => {
      const environment: Record<string, string> = {};
      const secrets = new EnvSecrets(environment);
      environment["HALONIC_SECRET_LATE"] = "late";
      expect(await secrets.get("late")).toBe("late");
    });
  });
});

verifies("env-secrets.no-other-variables", () => {
  it("never reads STUDIO_SECRET_ or a provider's own variable", async () => {
    const { environment, looked } = watched({
      STUDIO_SECRET_SERVE_PASSWORD: "old-prefix",
      STUDIO_SECRET_OPENAI: "old-prefix",
      OPENAI_API_KEY: "provider-variable",
      ANTHROPIC_API_KEY: "provider-variable",
    });
    const secrets = new EnvSecrets(environment);
    for (const name of [
      "serve-password",
      "openai",
      "OPENAI_API_KEY",
      "openai-api-key",
      "anthropic",
    ]) {
      expect(await secrets.get(name), name).toBeNull();
    }
    expect(looked.length).toBeGreaterThan(0);
    for (const key of looked) {
      expect(key).toMatch(/^HALONIC_SECRET_/);
    }
  });
});
