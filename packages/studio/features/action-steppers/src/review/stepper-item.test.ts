import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeCatalog, acmeSource, actionItem } from "../test-support/acme-catalog.test-helper.ts";
import {
  allowsAcme,
  requestDocument,
  restartBlock,
  serverSessionItem,
} from "../test-support/acme-server-session.test-helper.ts";
import { reviewActionItem } from "./action-item-review.ts";
import { actionItemOf, stepperItemReasons } from "./stepper-item.ts";

/** Approve the deployment of `acme/app` to `release`: one whole stepper from the acme catalog. */
const approveBlock = {
  kind: "use",
  ref: "github.approve-deployment@1",
  parameters: { owner: "acme", repo: "app", environment: "release", run: 123456 },
};

/** A card made 25 Nov 2026 at 09:00 UTC, pinning a request of `blocks`. */
const storedItem = (blocks: readonly unknown[] = [approveBlock]) =>
  serverSessionItem(requestDocument(blocks), { kind: "action" });

verifies("action-steppers.stepper-items", () => {
  describe("actionItemOf", () => {
    it("opens a request of one `use` block as its stepper, for review only, expiring 24 hours after the card", () => {
      const read = actionItemOf(storedItem());

      expect(read).toEqual({
        kind: "action",
        item: expect.objectContaining({
          id: "item-7",
          kind: "action",
          action: {
            definition: "github.approve-deployment",
            version: 1,
            parameters: approveBlock.parameters,
            expires: "2026-11-26T09:00:00.000Z",
          },
        }),
        runs: false,
      });
      // The item carries the request one way only, as the port has it.
      expect(read?.kind === "action" && read.item.stepper).toBeUndefined();
    });

    it("says it can't open a request of several blocks, or of one block that isn't a whole stepper", () => {
      const browser = {
        kind: "browser",
        url: "https://github.com/acme/app",
        instructions: ["Look."],
      };
      for (const blocks of [[approveBlock, approveBlock], [browser]]) {
        expect(actionItemOf(storedItem(blocks))).toEqual({
          kind: "unreadable",
          reasons: [stepperItemReasons.notOneStepper],
        });
      }
    });

    it("leaves a request of one server-session block to Run with Claude", () => {
      expect(actionItemOf(storedItem([restartBlock]))).toBeUndefined();
    });

    it("says the request changed when the document has a newer revision than the card pins", () => {
      const item = storedItem();
      if (item.stepper === undefined) throw new Error("a stepper item expected");
      const changed = { ...item, stepper: { ...item.stepper, changed: true } };

      expect(actionItemOf(changed)).toEqual({
        kind: "unreadable",
        reasons: [stepperItemReasons.changed],
      });
    });

    it("says it can't read a document that isn't a request", () => {
      expect(actionItemOf(serverSessionItem("not json"))).toEqual({
        kind: "unreadable",
        reasons: [stepperItemReasons.unreadable],
      });
    });

    it("opens an action item as it is, to run, and leaves any other item alone", () => {
      const item = actionItem();
      expect(actionItemOf(item)).toEqual({ kind: "action", item, runs: true });
      const { stepper: _, ...plain } = storedItem();
      expect(actionItemOf(plain)).toBeUndefined();
    });

    it("shows as expired once the card is more than 24 hours old", () => {
      const read = actionItemOf(storedItem());
      if (read?.kind !== "action") throw new Error("an action item expected");
      const review = (now: string) =>
        reviewActionItem(read.item, acmeSource, {
          catalog: acmeCatalog,
          policy: allowsAcme,
          now: new Date(now),
        });

      const fresh = review("2026-11-26T08:59:00.000Z");
      const old = review("2026-11-26T09:01:00.000Z");
      expect(fresh.kind === "stepper" && fresh.view.stage).toEqual({ kind: "desktop-only" });
      expect(old.kind === "stepper" && old.view.stage).toEqual({ kind: "expired" });
    });
  });
});
