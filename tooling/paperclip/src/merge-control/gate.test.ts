import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { mainFileOf, measuredFile } from "./gate.ts";
import {
  actionsOf,
  enqueued,
  entry,
  headOf,
  logText,
  pass,
  pull,
  said,
  snapshot,
} from "./merge-control.test-helper.ts";

verifies("paperclip.merge-control-merge-state", () => {
  test("a stacked, conflicting or not yet computed pull request stays out", () => {
    expect(enqueued(pass(snapshot({ pulls: [pull(1, { base: "ana/HAL-2-base" })] })))).toEqual([]);
    expect(enqueued(pass(snapshot({ pulls: [pull(1, { mergeable: "CONFLICTING" })] })))).toEqual(
      [],
    );
    expect(enqueued(pass(snapshot({ pulls: [pull(1, { mergeable: "UNKNOWN" })] })))).toEqual([]);
  });

  test("a branch outside the repository stays out, with one note per pull request", () => {
    const facts = snapshot({ pulls: [pull(1, { crossRepository: true, headOwner: "someone" })] });
    const first = pass(facts);
    expect(enqueued(first)).toEqual([]);
    expect(actionsOf(first, "comment").map((each) => each.body)).toEqual([
      "Queue manager: this PR is not queued. The merge queue only takes PRs from branches in this repository.",
    ]);
    const pushed = snapshot({
      pulls: [pull(1, { crossRepository: true, headOwner: "someone", head: "f".repeat(40) })],
    });
    expect(actionsOf(pass(pushed, first.state), "comment")).toEqual([]);
  });

  test("drafts and pull requests without built-on:paperclip are never added", () => {
    expect(enqueued(pass(snapshot({ pulls: [pull(1, { draft: true })] })))).toEqual([]);
    expect(enqueued(pass(snapshot({ pulls: [pull(1, { labels: [] })] })))).toEqual([]);
  });
});

verifies("paperclip.merge-control-hotspots", () => {
  test("a pull request sharing a hotspot with a queued one waits; other shared files don't hold it", () => {
    const queued = pull(1, { files: ["pnpm-lock.yaml", "src/index.ts"] });
    const lock = pull(2, { files: ["pnpm-lock.yaml"], fileNet: {} });
    const barrel = pull(3, { files: ["src/index.ts"], fileNet: {} });
    const decision = pass(snapshot({ pulls: [queued, lock, barrel], queue: [entry(1, 1)] }));
    expect(enqueued(decision)).toEqual([3]);
    expect(logText(decision)).toContain("#2(shares pnpm-lock.yaml with a queued PR (hotspot))");
  });

  test("two candidates sharing a hotspot don't go in together", () => {
    const one = pull(1, { files: [".github/workflows/ci.yml"], fileNet: {} });
    const two = pull(2, { files: [".github/workflows/ci.yml"], fileNet: {} });
    expect(enqueued(pass(snapshot({ pulls: [one, two] })))).toEqual([1]);
  });

  test("over 100 changed files waits to be queued by hand", () => {
    // Over 100 files is a security pull request too (HAL-19778): signed off here, to reach this rule.
    const h7 = headOf(1).slice(0, 7);
    const texts = [
      said(`Liam: approved on head \`${h7}\``),
      said(`Julian: security sign-off on head \`${h7}\``),
    ];
    const decision = pass(snapshot({ pulls: [pull(1, { filesTotal: 140, texts })] }));
    expect(enqueued(decision)).toEqual([]);
    expect(logText(decision)).toContain("touches 140 files (over 100), queue by hand");
  });
});

verifies("paperclip.merge-control-file-size", () => {
  const file = "packages/core/a/src/big.ts";

  test("a file main plus the queue plus this pull request would push over 500 lines holds it, with one note", () => {
    const queued = pull(1, { files: [file], fileNet: { [file]: 30 } });
    const mine = pull(2, { files: [file], fileNet: { [file]: 20 } });
    const facts = snapshot({
      pulls: [queued, mine],
      queue: [entry(1, 1)],
      mainFiles: { [file]: { lines: 460, barrel: false } },
    });
    const decision = pass(facts);
    expect(enqueued(decision)).toEqual([]);
    expect(actionsOf(decision, "comment").map((each) => each.body)).toEqual([
      `Queue manager: this PR is not queued yet. On top of current main and the PRs already queued, \`${file}\` would be 510 lines (main 460, #1 +30 (queued), this PR +20); the repo check's limit is 500, so its merge group would fail Fast gates. Please split the file by concept (one file per view, service or helper) and push; the queue manager adds the PR once the new head passes the gate.`,
    ]);
    expect(actionsOf(pass(facts, decision.state), "comment")).toEqual([]);
  });

  test("a barrel, a file already over on main, a shrinking file or an unmeasured one don't hold it", () => {
    const grow = (path: string, net: number) =>
      pull(2, { files: [path], fileNet: { [path]: net } });
    const main = (lines: number, barrel = false) => ({ [file]: { lines, barrel } });
    expect(
      enqueued(pass(snapshot({ pulls: [grow(file, 50)], mainFiles: main(490, true) }))),
    ).toEqual([2]);
    expect(enqueued(pass(snapshot({ pulls: [grow(file, 50)], mainFiles: main(520) })))).toEqual([
      2,
    ]);
    expect(enqueued(pass(snapshot({ pulls: [grow(file, -5)], mainFiles: main(499) })))).toEqual([
      2,
    ]);
    expect(measuredFile("docs/guide.md")).toBe(false);
    expect(measuredFile("src/generated/x.ts")).toBe(false);
  });

  test("main's line count and barrel shape are read from the file's text", () => {
    expect(mainFileOf("export * from './a.ts';\nexport { b } from './b.ts';\n")).toEqual({
      lines: 2,
      barrel: true,
    });
    expect(mainFileOf("const a = 1;\nexport { a };")).toEqual({ lines: 2, barrel: false });
  });
});
