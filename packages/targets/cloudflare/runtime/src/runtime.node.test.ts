import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ConfigurationError, missingBindings, type RuntimeEnv } from "./env.ts";
import { createRuntime, missingConfiguration } from "./runtime.ts";

// The adapters only keep their bindings until a call; these stand in for the real ones.
const namespace = { idFromName: (name: string) => name, get: () => ({}) };
const bindings = {
  COORDINATION: namespace,
  RUN: namespace,
  ROUTINES: namespace,
  DB: {},
  BLOBS: {},
  DEFINITIONS: {},
};
const secrets = {
  HALONIC_SECRET_TOKEN_KEY: "a-secret-value",
  HALONIC_SECRET_SERVE_PASSWORD: "another-secret-value",
};

function envWithout(name: keyof typeof bindings): RuntimeEnv {
  const { [name]: _left, ...rest } = bindings;
  return { ...rest, ...secrets } as unknown as RuntimeEnv;
}

verifies("runtime.configuration", () => {
  describe("the wiring in Node", () => {
    it("names the bindings an env lacks", () => {
      expect(missingBindings(envWithout("BLOBS"))).toEqual(["BLOBS"]);
      expect(missingBindings({})).toEqual([
        "COORDINATION",
        "RUN",
        "ROUTINES",
        "DB",
        "BLOBS",
        "DEFINITIONS",
      ]);
    });

    it("names the secrets that aren't configured, after the bindings", async () => {
      const env = { ...envWithout("RUN"), HALONIC_SECRET_SERVE_PASSWORD: "" };
      expect(await missingConfiguration(env)).toEqual(["RUN", "serve-password"]);
    });

    it("refuses to wire a deployment that lacks something, without repeating a value", async () => {
      const error = await createRuntime(envWithout("BLOBS")).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).missing).toEqual(["BLOBS"]);
      expect((error as ConfigurationError).message).not.toContain(secrets.HALONIC_SECRET_TOKEN_KEY);
    });

    it("wires every adapter when the deployment is complete", async () => {
      const runtime = await createRuntime({ ...bindings, ...secrets } as unknown as RuntimeEnv);
      expect(await runtime.secrets.get("token-key")).toBe(secrets.HALONIC_SECRET_TOKEN_KEY);
      expect(runtime.clock.now()).toBeInstanceOf(Date);
    });
  });
});
