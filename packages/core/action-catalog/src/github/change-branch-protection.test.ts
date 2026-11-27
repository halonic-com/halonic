import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkExpect, routesOf } from "@halonicjs/action-steppers";
import type { ActionSendResult } from "@halonicjs/ports";
import { parse } from "@halonicjs/schema-kit";
import { FakeActionSender, type SentActionCall } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type GithubRecording, parseGithubRecording } from "../github-replay.test-helper.ts";
import { manualGuideFor } from "../guide.test-helper.ts";
import { definition } from "./change-branch-protection.ts";

const parameters = {
  owner: "acme",
  repo: "app",
  branch: "main",
  required_approving_review_count: 2,
};
const placeholders = { owner: "acme", repo: "app", branch: "main" };
const reviewsPath = "/repos/acme/app/branches/main/protection/required_pull_request_reviews";
const fixtureFolder = join(
  import.meta.dirname,
  "..",
  "..",
  "fixtures",
  "github-change-branch-protection",
);

type Exchange = GithubRecording["exchanges"][number];

/** Reads one recorded scenario and checks it is a `halonic.recording/1` file. */
function readRecording(scenario: string): GithubRecording {
  return parseGithubRecording(readFileSync(join(fixtureFolder, `${scenario}.json`), "utf8"));
}

/** One recorded request, as the fake sender's `sent` lists it. */
function sentCall(exchange: Exchange): SentActionCall {
  const call: SentActionCall = {
    service: "github",
    method: exchange.request.method as SentActionCall["method"],
    path: exchange.request.url.slice("https://api.github.com".length),
  };
  if (exchange.request.body.kind === "json") {
    call.body = exchange.request.body.value as NonNullable<SentActionCall["body"]>;
  }
  return call;
}

/**
 * A fake sender signed in to GitHub as `acme-dev` that answers each call with
 * the recording's next exchange, on the definition's own routes.
 */
async function replay(scenario: string) {
  const recording = readRecording(scenario);
  let next = 0;
  const sender = new FakeActionSender({
    routes: routesOf(definition),
    signInAs: { github: "acme-dev" },
    answer: () => {
      const exchange = recording.exchanges[next++];
      if (exchange === undefined) return "unreachable";
      const body = exchange.response.body;
      const fields = body.kind === "json" ? (body.value as Record<string, unknown>) : {};
      const message = fields["message"];
      return typeof message === "string"
        ? { status: exchange.response.status, fields, error: message }
        : { status: exchange.response.status, fields };
    },
  });
  await sender.signIn("github");
  return { sender, recorded: recording.exchanges.map(sentCall) };
}

const check = (sender: FakeActionSender) =>
  sender.send({ definition: definition.id, version: 1, step: 1, placeholders });

const change = (sender: FakeActionSender, count: number) =>
  sender.send({
    definition: definition.id,
    version: 1,
    step: 2,
    placeholders,
    body: { required_approving_review_count: count },
  });

const failed = (status: number, error: string): ActionSendResult => ({
  outcome: "answered",
  status,
  kept: {},
  error,
});

verifies("action-catalog.github-change-branch-protection", () => {
  describe("github.change-branch-protection@1", () => {
    it("reads the review rule, previews before and after, then changes only the count", async () => {
      const { sender, recorded } = await replay("read-and-change");
      const today = await check(sender);
      const kept = {
        required_approving_review_count: 1,
        dismiss_stale_reviews: false,
        require_code_owner_reviews: true,
        require_last_push_approval: false,
      };
      expect(today).toEqual({ outcome: "answered", status: 200, kept });
      expect(checkExpect({ required_approving_review_count: 1 }, kept)).toEqual({ ok: true });
      expect(definition.preview(parameters, kept)[1]).toBe(
        "Required reviews on `main` today: 1. After: 2.",
      );
      expect(await change(sender, 2)).toEqual({
        outcome: "answered",
        status: 200,
        kept: { required_approving_review_count: 2 },
      });
      expect(sender.sent).toEqual(recorded);
      expect(sender.sent[1]?.body).toEqual({ required_approving_review_count: 2 });
    });

    it("stops before the change when the count differs from the request's expect", async () => {
      const { sender } = await replay("read-and-change");
      const today = await check(sender);
      const kept = today.outcome === "answered" ? today.kept : {};
      const result = checkExpect({ required_approving_review_count: 2 }, kept);
      expect(result).toMatchObject({
        ok: false,
        message: 'This changed since the request: "required_approving_review_count".',
      });
      expect(sender.sent).toEqual([{ service: "github", method: "GET", path: reviewsPath }]);
    });

    it.each([
      ["signed-out-401", 401, "Bad credentials"],
      ["missing-permission-403", 403, "Resource not accessible by integration"],
      ["no-classic-protection-404", 404, "Branch not protected"],
    ])(
      "hands back GitHub's own error for %s and keeps nothing",
      async (scenario, status, error) => {
        const { sender, recorded } = await replay(scenario);
        expect(await check(sender)).toEqual(failed(status, error));
        expect(sender.sent).toEqual(recorded);
      },
    );

    it("hands back GitHub's 422 for a count it refuses", async () => {
      const { sender, recorded } = await replay("count-out-of-range-422");
      expect(await change(sender, 7)).toEqual(
        failed(422, "Invalid request.\n\n7 is greater than the maximum of 6."),
      );
      expect(sender.sent).toEqual(recorded);
    });

    it("without a reading, previews the change and names the ruleset case for a 404", () => {
      expect(definition.preview(parameters)).toEqual([
        'Reads the review rule of `main` in acme/app; it needs your GitHub sign-in to have the Administration permission there. If GitHub answers "not found", no classic branch protection rule requires reviews on `main`; a ruleset may protect it instead: then use "Change a ruleset".',
        "Sets the required reviews on `main` in acme/app to 2.",
      ]);
      expect(definition.targets(parameters)).toEqual([
        { service: "github", kind: "branch", name: "acme/app:main" },
      ]);
    });

    it("builds a check that runs without the dialog and an admin call", () => {
      expect(routesOf(definition)).toMatchObject([
        { step: 1, kind: "call", method: "GET", risk: "routine", body: [] },
        {
          step: 2,
          kind: "call",
          method: "PATCH",
          risk: "admin",
          body: [{ name: "required_approving_review_count", kind: "integer" }],
        },
      ]);
    });

    it("gives a numbered manual guide on the branches page that names the ruleset case", () => {
      const guide = manualGuideFor(
        "github.change-branch-protection@1",
        parameters,
        "Require 2 reviews on main",
      );
      expect(guide).toBe(
        [
          "`Require 2 reviews on main`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/settings/branches",
          "2. Under **Branch protection rules**, find the rule for `main` and click **Edit**.",
          "3. Under **Require a pull request before merging**, read **Required number of approvals before merging**.",
          "4. If no rule for `main` requires reviews, a ruleset may protect it: look under **Rules** › **Rulesets** and use **Change a ruleset** instead.",
          "5. Open https://github.com/acme/app/settings/branches",
          "6. Set **Required number of approvals before merging** to `2`.",
          "7. Click **Save changes**.",
          "",
        ].join("\n"),
      );
    });

    it.each([
      { required_approving_review_count: 7 },
      { required_approving_review_count: -1 },
      { branch: "release/1" },
      { repo: "../secrets" },
      { path: "x" },
    ])("refuses %o", (change) => {
      expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
    });
  });
});
