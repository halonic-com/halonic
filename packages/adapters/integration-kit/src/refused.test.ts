import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { canary, client, refusal } from "./fake-transport.test-helper.ts";
import { leakAttemptCodes, type RefusalCode } from "./refused.ts";

const key = canary["example-key"];

/** A request the kit refuses with the given code. */
type Refused = () => Promise<unknown>;

/** One way for the integration to try to get a secret out, for each code in the list. */
const leakAttempts: Partial<Record<RefusalCode, Refused>> = {
  "secret-in-request": () => client().http.fetch(`https://api.example.com/v1?k=${key}`),
  "placement-not-in-sheet": () =>
    client().http.fetch("https://api.example.com/v1", {
      auth: { secret: "example-key", as: "header", header: "x-note-title" },
    }),
};

/** Ordinary refusals: the request is wrong, but no secret is going anywhere. */
const ordinaryRefusals: Partial<Record<RefusalCode, Refused>> = {
  "host-not-allowed": () => client().http.fetch("https://evil.example/"),
  "request-too-large": () =>
    client(undefined, { maxRequestBodyBytes: 1024 }).http.fetch("https://api.example.com/v1", {
      method: "POST",
      body: "x".repeat(2048),
    }),
  "secret-not-declared": () =>
    client().http.fetch("https://api.example.com/v1", { auth: { secret: "other", as: "bearer" } }),
};

verifies("integration-kit.leak-attempt-codes", () => {
  describe("leakAttemptCodes", () => {
    it("holds secret-in-request and placement-not-in-sheet", () => {
      expect([...leakAttemptCodes].sort()).toEqual(["placement-not-in-sheet", "secret-in-request"]);
    });

    it.each(leakAttemptCodes)("holds %s, a code the kit really refuses with", async (code) => {
      const attempt = leakAttempts[code];
      if (attempt === undefined) throw new Error(`add a leak attempt for ${code} to this test`);
      expect(await refusal(attempt())).toBe(code);
    });

    it.each(Object.entries(ordinaryRefusals))("leaves out %s", async (code, refused) => {
      expect(await refusal(refused())).toBe(code);
      expect(leakAttemptCodes).not.toContain(code);
    });

    it("can't be changed", () => {
      expect(Object.isFrozen(leakAttemptCodes)).toBe(true);
    });
  });
});
