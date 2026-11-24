import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ConfigurationError } from "./env.ts";
import { RoutinesObject, throwFailedStarts } from "./routines-object.ts";

// The wiring in Node, over the `cloudflare:workers` stub; `worker-scheduled-routines.test.ts`
// runs the real routines in workerd. A namespace names each object by its name.
const namespace = { idFromName: (name: string) => name, get: () => ({}) };
const bindings = {
  COORDINATION: namespace,
  RUN: namespace,
  ROUTINES: namespace,
  DB: {},
  BLOBS: {},
  DEFINITIONS: {},
};
// Test values made up for this file.
const secrets = {
  HALONIC_SECRET_TOKEN_KEY: "a-secret-value",
  HALONIC_SECRET_SERVE_PASSWORD: "another-secret-value",
};

/** A routines object named `name`, with an alarm that does nothing. */
function objectNamed(name: string, env: object): RoutinesObject {
  const ctx = {
    id: { equals: (other: unknown) => other === name },
    storage: { setAlarm: async () => undefined, deleteAlarm: async () => undefined },
  };
  return new RoutinesObject(ctx as unknown as DurableObjectState, env as Cloudflare.Env);
}

verifies("runtime.scheduled-routines", () => {
  describe("the Worker's routines object in Node", () => {
    it("does nothing on a scope's object, so it never builds a runtime", async () => {
      // Without the secrets, a build would fail with the configuration error.
      await expect(
        objectNamed("u/acme-user", { ...bindings }).tick("2026-11-13T12:00:00.000Z"),
      ).resolves.toBe(undefined);
    });

    it("fails the deployment's tick when the runtime can't be built, and builds again next time", async () => {
      const env: object = { ...bindings };
      const routines = objectNamed("routines", env);
      await expect(routines.tick("2026-11-13T12:00:00.000Z")).rejects.toBeInstanceOf(
        ConfigurationError,
      );
      // A kept failed build would reject with the configuration error again; a new build gets past it.
      Object.assign(env, secrets);
      // The rebuilt runtime's scheduler then fails on the stand-in object's missing `read`.
      await expect(routines.tick("2026-11-13T12:01:00.000Z")).rejects.toBeInstanceOf(TypeError);
    });

    it("fails the deployment's tick when the routine scheduler fails", async () => {
      // The stand-in bindings wire a runtime, but their objects have no `read`, so the
      // scheduler's first read throws a TypeError.
      const routines = objectNamed("routines", { ...bindings, ...secrets });
      await expect(routines.tick("2026-11-13T12:00:00.000Z")).rejects.toBeInstanceOf(TypeError);
    });

    it("names each routine and time whose run failed to start, with the start's error as the cause", () => {
      const refused = new Error("The local executor can't start agent runs yet.");
      expect(() => throwFailedStarts({ failed: [] } as never)).not.toThrow();
      const failure = (() => {
        try {
          throwFailedStarts({
            failed: [{ key: "acme/greet", at: "2026-11-13T12:04:00.000Z", error: refused }],
          } as never);
        } catch (error) {
          return error;
        }
        return undefined;
      })();
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).message).toBe(
        "Routine acme/greet couldn't start its run for 2026-11-13T12:04:00.000Z.",
      );
      expect(((failure as AggregateError).errors[0] as Error).cause).toBe(refused);
    });
  });
});
