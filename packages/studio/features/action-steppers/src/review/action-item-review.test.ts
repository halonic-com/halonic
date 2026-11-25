import { defaultRequesterPolicy, type RequesterPolicy } from "@halonicjs/action-steppers";
import type { MessagingSource } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { StepperView } from "../stepper-view.ts";
import {
  acmeCatalog,
  acmeSource,
  actionItem,
  approveRequest,
} from "../test-support/acme-catalog.test-helper.ts";
import { type ActionItem, reviewActionItem } from "./action-item-review.ts";

const now = new Date("2026-11-24T13:00:00.000Z");

/** Allows "Paperclip · Acme", the source the provider attests, to ask for more than routine. */
const allowsAcme: RequesterPolicy = {
  allowed: [{ source: { kind: "paperclip", id: acmeSource.id } }],
};

function review(
  item: ActionItem = actionItem(),
  policy: RequesterPolicy = allowsAcme,
  source: MessagingSource | undefined = acmeSource,
) {
  return reviewActionItem(item, source, { catalog: acmeCatalog, policy, now });
}

function viewOf(
  item?: ActionItem,
  policy?: RequesterPolicy,
  source?: MessagingSource,
): StepperView {
  const reviewed = review(item, policy, source);
  if (reviewed.kind !== "stepper") throw new Error(reviewed.reasons.join("; "));
  return reviewed.view;
}

verifies("action-steppers.review-mode", () => {
  describe("reviewActionItem", () => {
    it("shows an acme/app request for review with what it touches", () => {
      const view = viewOf();
      expect(view.touches).toEqual([
        { kind: "target", service: "GitHub", target: "repository acme/app" },
      ]);
      expect(view.title).toBe("Approve a deployment");
      expect(view.risk).toBe("admin");
      expect(view.stage).toEqual({ kind: "desktop-only" });
      expect(view.requester).toEqual({ name: "Chief", source: "Paperclip · Acme" });
      expect(view.reason).toBe("The release is ready. [Details](https://acme.example)");
      expect(view.expiresAt).toEqual(new Date("2026-11-25T12:00:00.000Z"));
      expect(view.steps.map((step) => [step.preview, step.action])).toEqual([
        [
          "Approves the deployment of acme/app to release for run 123456.",
          { kind: "script", script: "github/approve-deployment" },
        ],
      ]);
    });

    it("gives the reason for a definition outside the catalog, and no view", () => {
      const item = actionItem({ ...approveRequest, definition: "github.delete-repo" });
      expect(review(item)).toEqual({
        kind: "unreadable",
        reasons: ["`github.delete-repo@1` isn't in this Halonic's catalog"],
      });
    });

    it("refuses parameters the definition doesn't take", () => {
      const parameters = { ...approveRequest.parameters, branch: "main" };
      const reviewed = review(actionItem({ ...approveRequest, parameters }));
      expect(reviewed.kind).toBe("unreadable");
    });

    it("refuses an expiry that isn't a date", () => {
      const reviewed = review(actionItem({ ...approveRequest, expires: "soon" }));
      expect(reviewed).toEqual({
        kind: "unreadable",
        reasons: ["its expiry isn't a date and time"],
      });
    });

    it("blocks an admin request from a source the policy doesn't allow", () => {
      expect(viewOf(actionItem(), defaultRequesterPolicy).stage).toEqual({ kind: "blocked" });
    });

    it("blocks an agent the rule doesn't name, since a name only narrows", () => {
      const onlyOwen: RequesterPolicy = {
        allowed: [{ source: { kind: "paperclip", id: acmeSource.id }, agents: ["Owen"] }],
      };
      expect(viewOf(actionItem(), onlyOwen).stage).toEqual({ kind: "blocked" });
    });

    it("blocks a provider no policy kind attests, whatever its id", () => {
      const other = { ...acmeSource, provider: "fake" };
      expect(viewOf(actionItem(approveRequest, other), allowsAcme, other).stage).toEqual({
        kind: "blocked",
      });
    });

    it("lets anyone ask for a routine request", () => {
      const routine = {
        definition: "github.set-variable",
        version: 1,
        parameters: { owner: "acme", repo: "app", name: "DEPLOY_ENV" },
        expires: approveRequest.expires,
      };
      // A source the messaging doesn't list.
      const reviewed = reviewActionItem(actionItem(routine), undefined, {
        catalog: acmeCatalog,
        policy: defaultRequesterPolicy,
        now,
      });
      if (reviewed.kind !== "stepper") throw new Error(reviewed.reasons.join("; "));
      expect(reviewed.view.stage).toEqual({ kind: "desktop-only" });
      expect(reviewed.view.requester.source).toBe("an unknown source");
    });

    it("says an expired request has expired", () => {
      const item = actionItem({ ...approveRequest, expires: "2026-11-24T12:00:00.000Z" });
      expect(viewOf(item).stage).toEqual({ kind: "expired" });
    });

    it("fills a guided step's page and instructions from the parameters", () => {
      const routine = {
        definition: "github.set-variable",
        version: 1,
        parameters: { owner: "acme", repo: "app", name: "DEPLOY_ENV" },
        expires: approveRequest.expires,
      };
      const [page, value] = viewOf(actionItem(routine)).steps;
      expect(page?.action).toEqual({
        kind: "browser",
        address: "https://github.com/acme/app/settings/variables/actions/new",
        instructions: ["Type DEPLOY_ENV as the name and the value, then click Add variable."],
        source: { kind: "library", checkedOn: new Date(2026, 10, 24) },
        resultLabel: undefined,
      });
      expect(page?.risk).toBe("routine");
      expect(value?.action).toEqual({ kind: "input", label: "Variable value", secret: true });
    });
  });
});
