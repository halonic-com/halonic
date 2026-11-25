import { defaultRequesterPolicy } from "@halonicjs/action-steppers";
import type { InboxItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeSource, approveRequest } from "../test-support/acme-catalog.test-helper.ts";
import {
  acmeServerContext,
  requestDocument,
  restartBlock,
  serverSessionItem,
} from "../test-support/acme-server-session.test-helper.ts";
import { offerServerSession, type ServerSessionContext } from "./server-session-offer.ts";
import { serverChoice } from "./server-session-shell.ts";

function offer(item: InboxItem, context: Partial<ServerSessionContext> = {}) {
  return offerServerSession(item, acmeSource, { ...acmeServerContext, ...context });
}

/** A readable block of another kind: approve the deployment of `acme/app`. */
const useBlock = {
  kind: "use",
  ref: "github.approve-deployment@1",
  parameters: approveRequest.parameters,
};

verifies("action-steppers.run-with-claude", () => {
  describe("offerServerSession", () => {
    it("offers a pinned request whose single block is server-session, with the whole brief", () => {
      const offered = offer(serverSessionItem());
      expect(offered).toEqual({
        task: "HAL-1234",
        requester: "Chief",
        requestHash: "rev-2",
        brief: [
          "Task: https://paperclip.acme.example/HAL/issues/HAL-1234",
          "This brief was written by Chief, not checked by Halonic.",
          "Steps:",
          "1. Restart the acme-web service",
          "2. Check its log for errors",
          "Done when: https://acme.example/health answers 200",
          "When you finish or stop, report back on HAL-1234 as server sessions do.",
          "Never paste a key, token or password into the task.",
          "",
        ].join("\n"),
      });
    });

    it("offers nothing for a card with only a server-session label and no block", () => {
      const labelled = serverSessionItem(undefined, {
        question: "Labels: server-session. Please restart acme-web.",
      });
      const { stepper: _none, ...withoutRequest } = labelled;
      expect(offer(withoutRequest)).toBeUndefined();
      expect(offer({ ...withoutRequest, action: approveRequest })).toBeUndefined();
    });

    it("offers nothing on a revision the source has replaced", () => {
      const item = serverSessionItem();
      const stepper = item.stepper;
      if (stepper === undefined) throw new Error("a stepper item expected");
      expect(offer({ ...item, stepper: { ...stepper, changed: true } })).toBeUndefined();
    });

    it("offers nothing when the request has another block, or a block for another task", () => {
      expect(offer(serverSessionItem(requestDocument([useBlock])))).toBeUndefined();
      expect(offer(serverSessionItem(requestDocument([restartBlock, useBlock])))).toBeUndefined();
      const other = requestDocument([{ ...restartBlock, task: "HAL-99" }]);
      expect(offer(serverSessionItem(other))).toBeUndefined();
      expect(offer(serverSessionItem(), { task: undefined })).toBeUndefined();
    });

    it("offers nothing when the policy doesn't allow the source, or the item is answered", () => {
      expect(offer(serverSessionItem(), { policy: defaultRequesterPolicy })).toBeUndefined();
      const answered = serverSessionItem(undefined, {
        state: {
          kind: "answered",
          by: { kind: "me" },
          answer: { kind: "reply", text: "done" },
          answeredAt: "2026-11-25T10:00:00.000Z",
        },
      });
      expect(offer(answered)).toBeUndefined();
    });

    it("offers nothing when the brief can't be built, such as for an origin that isn't https", () => {
      expect(
        offer(serverSessionItem(), { origin: "http://paperclip.acme.example" }),
      ).toBeUndefined();
    });
  });

  describe("serverChoice", () => {
    it("is not set up while the host or the user is empty", () => {
      expect(serverChoice({ host: "", user: "ops", port: null })).toEqual({ kind: "not-set-up" });
      expect(serverChoice({ host: "build.acme.example", user: "", port: null })).toEqual({
        kind: "not-set-up",
      });
    });

    it("checks the server with validateServerTarget and never echoes a refused value", () => {
      expect(serverChoice({ host: "build.acme.example", user: "ops", port: 2222 })).toEqual({
        kind: "set",
        target: { host: "build.acme.example", user: "ops", port: 2222 },
      });
      const refused = serverChoice({ host: "-oProxyCommand=x", user: "ops", port: null });
      expect(refused.kind).toBe("refused");
      expect(JSON.stringify(refused)).not.toContain("ProxyCommand");
    });
  });
});
