import type { ActionOperationRoute, InboxActionRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setsSecret, stepRequest } from "./step-request.ts";

const setSecret: ActionOperationRoute = {
  kind: "operation",
  definition: "paperclip.set-secret",
  version: 1,
  step: 1,
  service: "paperclip",
  risk: "admin",
  placeholders: { name: "^[A-Z][A-Z0-9_]{0,63}$" },
  operation: "paperclip.set-secret",
  body: [{ name: "value", kind: "secret-input" }],
  keep: ["setOn"],
};

const request: InboxActionRequest = {
  definition: "paperclip.set-secret",
  version: 1,
  parameters: { host: "paperclip.acme.example", company: "ACME", name: "ACME_API_KEY" },
  expires: "2026-11-29T12:00:00.000Z",
};

verifies("action-steppers.shell-run", () => {
  describe("an operation step", () => {
    it("sends only its reference: the sender asks for the secret in its own dialog", () => {
      const sent = stepRequest(request, setSecret, undefined);
      expect(sent).toEqual({
        definition: "paperclip.set-secret",
        version: 1,
        step: 1,
        placeholders: { name: "ACME_API_KEY" },
      });
    });

    it("counts as setting a secret, so its answer may only say when", () => {
      expect(setsSecret(setSecret)).toBe(true);
      expect(setsSecret({ ...setSecret, body: [] })).toBe(false);
      expect(setsSecret(undefined)).toBe(false);
    });
  });
});
