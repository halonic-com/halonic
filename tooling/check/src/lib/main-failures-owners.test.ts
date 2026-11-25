import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { routingOf } from "@halonicjs/tooling-paperclip/routing";
import { expect, test } from "vitest";
import { areaReports, parseAreaTable } from "./main-failures.ts";
import { findRepoRoot } from "./workspace.ts";

const table = parseAreaTable(
  readFileSync(join(findRepoRoot(), "docs/guides/area-owners.md"), "utf8"),
);

/** Each area's slug and owner, as the nightly writes them. */
function owners(routing?: unknown): Record<string, string> {
  const reports = areaReports({
    table,
    latest: { url: "run", jobs: [] },
    logs: new Map(),
    routing: routing === undefined ? undefined : routingOf(routing),
  });
  return Object.fromEntries(reports.map((report) => [report.slug, report.owner]));
}

/** A snapshot with no tools and this routing, as JSON data. */
function snapshotWith(routing: unknown): unknown {
  const commit = "0123456789abcdef0123456789abcdef01234567";
  return { format: 1, workspace: { name: "Acme", commit }, tools: [], routing };
}

verifies("check.main-failures-owners", () => {
  test("names the area table's owners while there is no routing", () => {
    expect(owners()).toMatchObject({ integrations: "Tomas, with Ravi", docs: "Maya" });
  });

  test("names the routing's owners, and the code reviewer for an area it leaves out", () => {
    const routing = snapshotWith({ roles: { "code-reviewer": "owen" }, areas: { docs: "maya" } });
    expect(owners(routing)).toMatchObject({ docs: "maya", studio: "owen" });
  });

  test("keeps the area table's owners when the snapshot's routing is refused", () => {
    expect(owners(snapshotWith({ areas: { "github-login": "kim" } }))).toEqual(owners());
  });
});
