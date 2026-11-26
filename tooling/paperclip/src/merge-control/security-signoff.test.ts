import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { gateRow } from "./gate.ts";
import {
  ago,
  enqueued,
  entry,
  headOf,
  pass,
  pull,
  said,
  snapshot,
  testSettings,
} from "./merge-control.test-helper.ts";
import type { GatePull } from "./snapshot.ts";

const liam = (number: number) => said(`Liam: approved on head \`${headOf(number).slice(0, 7)}\``);
const signOff = (number: number, minutes = 20) =>
  said(`Julian: security sign-off on head \`${headOf(number).slice(0, 12)}\``, minutes);

function reasonsOf(each: GatePull): string {
  return gateRow(snapshot({ pulls: [each] }), each, testSettings).reasons.join("\n");
}

/** #6418 as the live gate saw it on 26 Nov: a trust path, Liam's approval, no sign-off yet. */
function trustPull(changes: Partial<GatePull> = {}): GatePull {
  const files = ["packages/core/app/src/trusted-runner-start.ts", ".changeset/connector-paused.md"];
  return pull(6418, { files, filesTotal: files.length, texts: [liam(6418)], ...changes });
}

verifies("paperclip.merge-control-security-signoff", () => {
  test("a security PR approved by Liam waits for Julian's sign-off on its head (#6418)", () => {
    const decision = pass(snapshot({ pulls: [trustPull()] }));
    expect(enqueued(decision)).toEqual([]);
    expect(reasonsOf(trustPull())).toContain(
      `security PR: waiting for "Julian: security sign-off on head ${headOf(6418).slice(0, 9)}"`,
    );
  });

  test("the sign-off on the head, after the last push, lets it in", () => {
    const signed = trustPull({ texts: [liam(6418), signOff(6418)] });
    expect(enqueued(pass(snapshot({ pulls: [signed] })))).toEqual([6418]);
  });

  test("a sign-off on another head, before the last push, or with changes asked doesn't count", () => {
    const other = said("Julian: security sign-off on head `abcdef1234`", 20);
    const early = signOff(6418, 90);
    const asks = said(
      `Julian: security sign-off on head \`${headOf(6418).slice(0, 9)}\`\nchanges requested`,
    );
    for (const text of [other, early, asks]) {
      expect(
        enqueued(pass(snapshot({ pulls: [trustPull({ texts: [liam(6418), text] })] }))),
      ).toEqual([]);
    }
  });

  test("Julian's change request after the sign-off takes it back", () => {
    const later = said("Julian: changes requested, the pause key leaks", 10);
    const texts = [liam(6418), signOff(6418), later];
    expect(enqueued(pass(snapshot({ pulls: [trustPull({ texts })] })))).toEqual([]);
  });

  test("the label or a security-review line marks a PR with no security path (#6431)", () => {
    const labelled = pull(6431, { labels: ["built-on:paperclip", "security"] });
    const described = pull(6431, { body: "Summary\n\nsecurity-review: HAL-19291" });
    expect(reasonsOf(labelled)).toContain("security PR: waiting for");
    expect(reasonsOf(described)).toContain("security PR: waiting for");
    expect(reasonsOf(pull(6431))).not.toContain("security PR");
  });

  test("an indented or spaced security review line, or files past what the gate reads, mark it (HAL-19778)", () => {
    for (const body of ["Summary\n  security review: HAL-1", "Security-Review\nwhy"]) {
      expect(reasonsOf(pull(6431, { body }))).toContain("security PR: waiting for");
    }
    expect(reasonsOf(pull(6431, { body: "security-reviewed elsewhere" }))).not.toContain(
      "security PR",
    );
    expect(reasonsOf(pull(6431, { filesTotal: 101 }))).toContain("security PR: waiting for");
  });

  test("Tauri paths count; changesets, lockfiles and workflows don't", () => {
    const tauri = pull(7, { files: ["apps/studio/src-tauri/src/commands.rs"], filesTotal: 1 });
    expect(reasonsOf(tauri)).toContain("security PR");
    const plain = [".changeset/trust-pause.md", "pnpm-lock.yaml", ".github/workflows/ci.yml"];
    expect(reasonsOf(pull(8, { files: plain, filesTotal: plain.length }))).not.toContain(
      "security PR",
    );
  });

  test("an action catalog path counts (HAL-20215)", () => {
    const files = ["packages/core/action-catalog/src/github/x.ts"];
    expect(reasonsOf(pull(9, { files, filesTotal: 1 }))).toContain("security PR: waiting for");
  });

  test("a queued security PR without the sign-off isn't taken out", () => {
    const decision = pass(snapshot({ pulls: [trustPull()], queue: [entry(6418, 1)] }));
    expect(decision.actions.filter((action) => action.kind === "dequeue")).toEqual([]);
    expect(decision.state.lastQueue).toEqual([6418]);
  });
});

verifies("paperclip.merge-control-other-base", () => {
  test("a release-branch base says how it reaches main in the live Merger's words, not 'stacked' (#6416)", () => {
    for (const base of ["release/0.1.3", "changeset-release/main", "hotfix/0.1.4"]) {
      const release = pull(6416, { base, headCommittedAt: ago(60) });
      expect(reasonsOf(release)).toContain(
        `targets ${base}, not main (a release branch): retarget it to main, or the release captain merges it into the release branch`,
      );
      expect(reasonsOf(release)).not.toContain("stacked");
    }
  });

  test("any other base that isn't an open PR's branch counts as a stack, as live does", () => {
    expect(reasonsOf(pull(6417, { base: "mateo/HAL-1-gone" }))).toContain(
      "targets mateo/HAL-1-gone, not main (stacked PR)",
    );
  });

  test("a base that is an open PR's branch keeps the stacked wording", () => {
    const lower = pull(1);
    const upper = pull(2, { base: lower.branch });
    const facts = snapshot({ pulls: [lower, upper] });
    expect(gateRow(facts, upper, testSettings).reasons.join("\n")).toContain(
      `targets ${lower.branch}, not main (stacked PR)`,
    );
  });
});

verifies("paperclip.merge-control-julian-scope", () => {
  test("Julian's approval of #6452 (seat mover, 123 lines, no security path) queues it", () => {
    const files = [
      "tooling/paperclip/README.md",
      "tooling/paperclip/src/seat-mover/plan.ts",
      "tooling/paperclip/src/seat-mover/plan.test.ts",
    ];
    const julian = said(`Julian: approved on head \`${headOf(6452)}\`\n\nChecked: the spread rule`);
    const seatMover = pull(6452, {
      branch: "tomas/HAL-19394-seat-mover-spread",
      files,
      filesTotal: files.length,
      additions: 110,
      deletions: 13,
      texts: [julian],
    });
    expect(enqueued(pass(snapshot({ pulls: [seatMover] })))).toEqual([6452]);
  });
});
