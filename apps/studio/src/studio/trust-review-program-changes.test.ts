import { verifies } from "@halonicjs/testing-spec";
import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { trustReviewOf } from "./trust-review.ts";

const program = (args: string[], env: Record<string, string>): ConnectorTrustContent => ({
  id: "files",
  transport: "stdio",
  settings: {
    command: "node",
    args,
    cwd: "tools",
    env,
    secretEnv: {},
    path: "/usr/local/bin/node",
  },
  tools: { approve: [] },
});

/** The Changed row of a program trusted as `before` that is now `after`. */
function changedRow(before: ConnectorTrustContent, after: ConnectorTrustContent) {
  const review = trustReviewOf(
    {
      status: "changed",
      content: { connectors: [after] },
      trustedAt: "2026-11-03T12:00:00.000Z",
      changes: {
        added: [],
        changed: [{ id: "files", before, after, fields: ["settings"] }],
        removed: [],
        unchanged: 0,
        agents: { added: [], changed: [], removed: [], unchanged: 0 },
        integrations: { added: [], changed: [], removed: [], unchanged: 0 },
        providers: { added: [], changed: [], removed: [], unchanged: 0 },
        onlyRemoves: false,
      },
      fingerprint: "hfp1:00",
      unpinned: [],
    },
    { name: "Acme", folder: "/work/acme" },
  );
  return review?.sections[0]?.rows[0];
}

verifies("studio.trust-review-program-changes", () => {
  it("pairs a changed env entry with its old value by name, and keeps the unchanged lines", () => {
    const row = changedRow(
      program(["files.js"], { NODE_OPTIONS: "--require ./setup.js" }),
      program(["files.js"], { NODE_OPTIONS: "--require ./other.js", LOG_LEVEL: "debug" }),
    );

    expect(row).toMatchObject({ tag: "Changed", detail: "node files.js" });
    expect(row?.detailWas).toBeUndefined();
    expect(row?.lines).toEqual([
      ["Runs", "/usr/local/bin/node", "code"],
      ["Working folder", "tools", "code"],
      ["Environment", "LOG_LEVEL=debug", "code", "added"],
      [
        "",
        "NODE_OPTIONS=--require ./other.js",
        "code",
        { was: "NODE_OPTIONS=--require ./setup.js" },
      ],
    ]);
  });

  it("shows the old command when the command or its arguments changed", () => {
    const row = changedRow(program(["files.js"], {}), program(["files-2.js"], {}));

    expect(row).toMatchObject({ detail: "node files-2.js", detailWas: "node files.js" });
  });

  it("gives a one-value field its old value, and a field it no longer has no line", () => {
    const before = program(["files.js"], { LOG_LEVEL: "debug" });
    const after = { ...before, settings: { ...before.settings, cwd: "src", env: {} } };

    expect(changedRow(before, after)?.lines).toEqual([
      ["Runs", "/usr/local/bin/node", "code"],
      ["Working folder", "src", "code", { was: "tools" }],
    ]);
  });
});
