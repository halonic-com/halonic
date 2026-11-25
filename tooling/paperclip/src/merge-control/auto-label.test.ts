import { verifies } from "@halonicjs/testing-spec";
import { expect, test, vi } from "vitest";
import { rulesOf } from "../plugin/merge-control-job.ts";
import { act } from "./act.ts";
import { isGatePull } from "./facts-pulls.ts";
import type { PullNode } from "./facts-query.ts";
import {
  actionsOf,
  boardLogin,
  check,
  enqueued,
  logText,
  pass,
  pull,
  snapshot,
  testSettings,
} from "./merge-control.test-helper.ts";
import type { GatePull } from "./snapshot.ts";
import { queueWriteClient, refusal } from "./write-client.ts";

const settings = { ...testSettings, autoLabelAuthors: ["halonic-dev", boardLogin] };

/** An open pull request with no `built-on:*` label, approved and green unless changed. */
function unlabelled(number: number, changes: Partial<GatePull> = {}): GatePull {
  return pull(number, { labels: [], author: "halonic-dev", ...changes });
}

function labelled(decision: ReturnType<typeof pass>): number[] {
  return actionsOf(decision, "add-label").map((each) => each.number);
}

verifies("paperclip.merge-control-auto-label", () => {
  test("only the approved, green, unlabelled team pull request gets the label and one note, and isn't queued", () => {
    const facts = snapshot({
      pulls: [
        unlabelled(5),
        unlabelled(6, { author: "someone-else" }),
        unlabelled(7, { texts: [] }),
        unlabelled(8, { checks: [check("ci-ok", "CI", { conclusion: "failure" })] }),
        unlabelled(9, { author: null }),
        unlabelled(10, { labels: ["built-on:other"] }),
        unlabelled(11, { draft: true }),
        pull(12),
      ],
    });
    const decision = pass(facts, undefined, settings);
    expect(labelled(decision)).toEqual([5]);
    expect(actionsOf(decision, "add-label")[0]).toMatchObject({
      label: "built-on:paperclip",
      head: facts.pulls[0]?.head,
    });
    expect(actionsOf(decision, "add-label")[0]?.comment).not.toContain("@");
    expect(enqueued(decision)).toEqual([12]);
    expect(logText(decision)).toContain("AUTO_LABEL #5");
  });

  test("the board's queue login from config counts like the team account", () => {
    const decision = pass(
      snapshot({ pulls: [unlabelled(5, { author: boardLogin })] }),
      undefined,
      settings,
    );
    expect(labelled(decision)).toEqual([5]);
    const without = pass(snapshot({ pulls: [unlabelled(5, { author: boardLogin })] }));
    expect(labelled(without)).toEqual([]);
  });

  test("it is labelled once per head, and the next pass gates it as usual", () => {
    const first = pass(snapshot({ pulls: [unlabelled(5)] }), undefined, settings);
    const again = pass(snapshot({ pulls: [unlabelled(5)] }), first.state, settings);
    expect(labelled(again)).toEqual([]);
    const next = pass(
      snapshot({ pulls: [unlabelled(5, { labels: ["built-on:paperclip"] })] }),
      first.state,
      settings,
    );
    expect(labelled(next)).toEqual([]);
    expect(enqueued(next)).toEqual([5]);
  });

  test("the action sends the label, then the note", async () => {
    const decision = pass(snapshot({ pulls: [unlabelled(5)] }), undefined, settings);
    const fetch = vi.fn(async (_url: string, _init: { method: string; body?: string }) => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    }));
    const client = queueWriteClient({ fetch, token: async () => "t", repos: ["acme/tools"] });
    const results = await act(decision.actions, { repo: "acme/tools", client });
    expect(results.map((each) => [each.action, each.outcome])).toEqual([["add-label #5", "sent"]]);
    expect(fetch.mock.calls.map(([url, init]) => [url, init.body])).toEqual([
      [
        "https://api.github.com/repos/acme/tools/issues/5/labels",
        JSON.stringify({ labels: ["built-on:paperclip"] }),
      ],
      [
        "https://api.github.com/repos/acme/tools/issues/5/comments",
        JSON.stringify({ body: actionsOf(decision, "add-label")[0]?.comment }),
      ],
    ]);
  });

  test("the write client adds no other label, on no other path or repository", () => {
    const labels = "https://api.github.com/repos/acme/tools/issues/5/labels";
    const allowed = JSON.stringify({ labels: ["built-on:paperclip"] });
    expect(refusal({ url: labels, method: "POST", body: allowed }, ["acme/tools"])).toBeUndefined();
    const refused = [
      { url: labels, method: "POST", body: JSON.stringify({ labels: ["fast-track"] }) },
      {
        url: labels,
        method: "POST",
        body: JSON.stringify({ labels: ["built-on:paperclip", "fast-track"] }),
      },
      { url: labels, method: "POST", body: JSON.stringify(["built-on:paperclip"]) },
      {
        url: labels,
        method: "POST",
        body: JSON.stringify({ labels: ["built-on:paperclip"], extra: 1 }),
      },
      { url: labels, method: "POST" },
      { url: labels, method: "PUT", body: allowed },
      { url: labels, method: "DELETE" },
      { url: `${labels}/fast-track`, method: "POST", body: allowed },
      { url: "https://api.github.com/repos/acme/tools/labels", method: "POST", body: allowed },
      {
        url: "https://api.github.com/repos/someone/else/issues/5/labels",
        method: "POST",
        body: allowed,
      },
    ];
    for (const request of refused) {
      expect({ request, refused: refusal(request, ["acme/tools"]) !== undefined }).toEqual({
        request,
        refused: true,
      });
    }
  });
});

function node(changes: Partial<PullNode>): PullNode {
  return {
    isInMergeQueue: false,
    isDraft: false,
    labels: { nodes: [] },
    author: { login: "halonic-dev" },
    ...changes,
  } as PullNode;
}

verifies("paperclip.merge-control-auto-label", () => {
  test("the facts read the auto-label authors' unlabelled open pull requests, and no one else's", () => {
    const authors = ["halonic-dev", boardLogin];
    expect(isGatePull(node({}), authors)).toBe(true);
    expect(isGatePull(node({ author: { login: boardLogin } }), authors)).toBe(true);
    expect(isGatePull(node({ author: { login: "someone-else" } }), authors)).toBe(false);
    expect(isGatePull(node({ author: null }), authors)).toBe(false);
    expect(isGatePull(node({ isDraft: true }), authors)).toBe(false);
    expect(isGatePull(node({ labels: { nodes: [{ name: "built-on:other" }] } }), authors)).toBe(
      false,
    );
    expect(isGatePull(node({}))).toBe(false);
    expect(
      isGatePull(
        node({ author: { login: "x" }, labels: { nodes: [{ name: "built-on:halonic" }] } }),
      ),
    ).toBe(true);
  });
});

verifies("paperclip.merge-control-auto-label", () => {
  test("the board's queue login comes from the plugin's config, never from code", () => {
    expect(rulesOf({}).autoLabelAuthors).toEqual(["halonic-dev"]);
    expect(rulesOf({ mergeControl: { mergerLogin: ` ${boardLogin} ` } }).autoLabelAuthors).toEqual([
      "halonic-dev",
      boardLogin,
    ]);
    expect(rulesOf({ mergeControl: { mergerLogin: "not a login!" } }).autoLabelAuthors).toEqual([
      "halonic-dev",
    ]);
  });
});
