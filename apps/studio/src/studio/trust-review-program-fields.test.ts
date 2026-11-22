import { verifies } from "@halonicjs/testing-spec";
import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { type IntegrationRuns, trustReviewOf } from "./trust-review.ts";

const fingerprint = "hfp1:00";

const files = (env: Record<string, string>): ConnectorTrustContent => ({
  id: "files",
  transport: "stdio",
  settings: {
    command: "node",
    args: ["files.js"],
    cwd: "tools",
    env,
    secretEnv: {},
    path: "/usr/local/bin/node",
    sites: ["pypi.org"],
  },
  tools: { approve: [] },
});
const program = files({ NODE_OPTIONS: "--require ./setup.js", LOG_LEVEL: "debug" });

const firstCheck = (runs: IntegrationRuns) =>
  trustReviewOf(
    { status: "new", content: { connectors: [program] }, fingerprint, unpinned: [] },
    { name: "Acme", folder: "/work/acme", runs },
  );

const programLines = [
  ["Runs", "/usr/local/bin/node", "code"],
  ["Working folder", "tools", "code"],
  ["Environment", "LOG_LEVEL=debug", "code"],
  ["", "NODE_OPTIONS=--require ./setup.js", "code"],
];

verifies("studio.trust-review-program-fields", () => {
  it("shows a program's path, working folder, env entries and, in the sandbox, its sites", () => {
    const review = firstCheck({ state: "fenced" });

    expect(review?.summary).toEqual(["Will start 1 program and allow 1 site."]);
    expect(review?.sections[0]?.rows).toEqual([
      {
        id: "files",
        detail: "node files.js",
        lines: [...programLines, ["Allowed sites", "pypi.org", "code"]],
        warning: undefined,
      },
    ]);
  });

  it("shows and counts no site of a program outside the sandbox", () => {
    const review = firstCheck(undefined);

    expect(review?.summary).toEqual(["Will start 1 program."]);
    expect(review?.sections[0]?.rows[0]?.lines).toEqual(programLines);
  });

  it("shows a changed program's new env entry", () => {
    const after = files({ NODE_OPTIONS: "--require ./other.js" });
    const review = trustReviewOf(
      {
        status: "changed",
        content: { connectors: [after] },
        trustedAt: "2026-11-03T12:00:00.000Z",
        changes: {
          added: [],
          changed: [{ id: "files", before: program, after, fields: ["settings"] }],
          removed: [],
          unchanged: 0,
          agents: { added: [], changed: [], removed: [], unchanged: 0 },
          integrations: { added: [], changed: [], removed: [], unchanged: 0 },
          providers: { added: [], changed: [], removed: [], unchanged: 0 },
          onlyRemoves: false,
        },
        fingerprint,
        unpinned: [],
      },
      { name: "Acme", folder: "/work/acme" },
    );

    expect(review?.sections[0]?.rows[0]).toMatchObject({
      tag: "Changed",
      lines: expect.arrayContaining([
        [
          "Environment",
          "NODE_OPTIONS=--require ./other.js",
          "code",
          { was: "NODE_OPTIONS=--require ./setup.js" },
        ],
      ]),
    });
  });
});
