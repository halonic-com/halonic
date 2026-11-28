import type { ActionCallRoute } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { approveBody, approveRun, runValues, stepOf } from "./action-sender-routes.ts";
import { FakeActionSender } from "./fake-action-sender.ts";

/** The contract's approve route, keeping dotted names as a catalog step may. */
const keepingPaths: ActionCallRoute = {
  ...approveRun,
  keep: [
    "triggering_actor.login",
    "head_commit.author",
    "pull_requests.url",
    "missing.path",
    "dotted.key",
  ],
};

/** A nested answer, with invented `acme` data. */
const fields = {
  triggering_actor: { login: "acme-dev" },
  head_commit: { author: { name: "Acme Dev" } },
  pull_requests: [{ url: "https://api.github.com/repos/acme/app/pulls/1" }],
  missing: "a text, not an object",
  "dotted.key": "kept only as a path",
};

verifies("contracts.action-sender", () => {
  it("walks a dotted kept name one object key at a time, keeping only a plain value at the end", async () => {
    const sender = new FakeActionSender({
      routes: [keepingPaths],
      answer: () => ({ status: 200, fields }),
      signInAs: { github: "acme-dev" },
    });
    await sender.signIn("github");

    const result = await sender.send(stepOf(keepingPaths, runValues, approveBody));

    expect(result).toEqual({
      outcome: "answered",
      status: 200,
      kept: { "triggering_actor.login": "acme-dev" },
    });
  });
});
