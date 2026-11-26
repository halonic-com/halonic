import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { reviewerFor } from "../reviewer-paths.ts";
import { approvalOf, outsideJulianScope, outsideNoraScope } from "./approval.ts";
import { changeRequestOf } from "./change-request.ts";
import {
  actionsOf,
  ago,
  enqueued,
  entry,
  headOf,
  pass,
  pull,
  said,
  snapshot,
} from "./merge-control.test-helper.ts";

const head = headOf(1);
const old = headOf(1, 1);

function reasonsOf(changes: Parameters<typeof pull>[1], patchIds = {}) {
  const decision = pass(snapshot({ pulls: [pull(1, changes)], patchIds }));
  return { added: enqueued(decision), decision };
}

verifies("paperclip.merge-control-signed-approval", () => {
  test("Liam's signed approval of the head after the last push lets it in, by a 7-character prefix", () => {
    expect(
      reasonsOf({ texts: [said(`Liam: approved on head \`${head.slice(0, 7)}\``)] }).added,
    ).toEqual([1]);
  });

  test("an approval from before the last push, of another head, or unsigned doesn't count", () => {
    const early = said(`Liam: approved on head \`${head.slice(0, 7)}\``, 30);
    expect(reasonsOf({ texts: [early], forcePushedAt: [ago(10)] }).added).toEqual([]);
    expect(
      reasonsOf({ texts: [said(`Liam: approved on head \`${old.slice(0, 7)}\``)] }).added,
    ).toEqual([]);
    expect(reasonsOf({ texts: [said(`Review of ${head.slice(0, 9)}: looks good`)] }).added).toEqual(
      [],
    );
  });

  test("a signed line from another account, or a queue manager comment naming Liam, doesn't count", () => {
    const stranger = said(`Liam: approved on head \`${head.slice(0, 7)}\``, 30, { by: "someone" });
    const echo = said(`Queue manager: Liam: approved on head ${head.slice(0, 7)}`);
    expect(reasonsOf({ texts: [stranger] }).added).toEqual([]);
    expect(reasonsOf({ texts: [echo] }).added).toEqual([]);
  });

  test("a signed line after notes counts on any line of a signed comment, as on #5758", () => {
    const notes = "reviewed the gate and its tests.\n[nit] one wording note, no change needed.\n";
    const signed = said(`Liam: ${notes}\nLiam: approved on head \`${head.slice(0, 7)}\``);
    expect(approvalOf(pull(1, { texts: [signed] }), "halonic-dev", {}).approval?.ok).toBe(true);
    expect(reasonsOf({ texts: [signed] }).added).toEqual([1]);
    const julian = said(`Julian: ${notes}\nJulian: approved on head \`${head.slice(0, 7)}\``);
    expect(reasonsOf({ texts: [julian] }).added).toEqual([1]);
  });

  test("#6002: Liam's full-sha approval with notes below counts, and the plugin's reviewerFor routes it as live does", () => {
    const files = [
      "packages/core/assistant/README.md",
      "packages/core/assistant/src/build/integration-checks.test.ts",
      "packages/core/assistant/src/build/integration-checks.ts",
      "packages/core/assistant/src/build/integration-proposals.test.ts",
      "packages/core/assistant/src/build/read-tools.ts",
      "packages/core/assistant/src/build/requirements/integration-proposals.md",
      "packages/core/assistant/src/build/requirements/validate-integrations.md",
      "packages/core/assistant/src/testing/notes-integration.test-helper.ts",
    ];
    // The live Merger and pr_status both route #6002 (602 changed lines, no Liam path) to Julian.
    expect(reviewerFor({ files, changedLines: 602, sensitive: false })).toBe("julian");
    const body = [
      `Liam: approved on head \`${head}\``,
      "",
      "- **Untrusted workspace:** integration lines go through the same `proposalRefusal` filter.",
      "",
      "Notes, not blocking:",
      "- The patterns also match inside comments and strings.",
      "",
      "602 changed lines is over the 400-line guide, but only 236 are code, so no split needed.",
    ].join("\n");
    const changes = { files, filesTotal: files.length, additions: 599, deletions: 3 };
    const decision = pass(snapshot({ pulls: [pull(1, { ...changes, texts: [said(body, 1)] })] }));
    expect(enqueued(decision)).toEqual([1]);
  });

  test("an unsigned mention of the head on line 4 still doesn't count", () => {
    const notes = "Reviewed the gate and its tests.\n[nit] one wording note.\n";
    const unsigned = said(`${notes}\nLooks approved on head \`${head.slice(0, 7)}\` to me`);
    expect(approvalOf(pull(1, { texts: [unsigned] }), "halonic-dev", {}).approval).toBeNull();
    expect(reasonsOf({ texts: [unsigned] }).added).toEqual([]);
  });

  test("a GitHub approval review on the head that names Liam counts", () => {
    const review = said("Liam: looks right", 30, {
      kind: "review",
      reviewState: "APPROVED",
      commit: head,
    });
    expect(reasonsOf({ texts: [review] }).added).toEqual([1]);
  });
});

verifies("paperclip.merge-control-carry-over", () => {
  test("an approval of an older head carries over an identical diff, with one note", () => {
    const texts = [said(`Liam: approved on head \`${old.slice(0, 7)}\``)];
    const { added, decision } = reasonsOf({ texts }, { [old.slice(0, 7)]: "p1", [head]: "p1" });
    expect(added).toEqual([1]);
    expect(actionsOf(decision, "comment").map((each) => each.body)).toEqual([
      `Approval of ${old.slice(0, 7)} carried to ${head.slice(0, 9)}: rebase only, identical diff.`,
    ]);
  });

  test("any change to the diff needs a new review", () => {
    const texts = [said(`Liam: approved on head \`${old.slice(0, 7)}\``)];
    expect(reasonsOf({ texts }, { [old.slice(0, 7)]: "p1", [head]: "p2" }).added).toEqual([]);
  });

  test("an approval of the same head from before a push doesn't carry over to it (HAL-19778)", () => {
    const texts = [said(`Liam: approved on head \`${head}\``, 30)];
    const changes = { texts, forcePushedAt: [ago(10)] };
    expect(reasonsOf(changes, { [head]: "p1" }).added).toEqual([]);
  });
});

verifies("paperclip.merge-control-julian-scope", () => {
  const julian = said(`Julian: approved on head \`${head.slice(0, 7)}\``);

  test("Julian's approval counts within reviewerFor's limits", () => {
    expect(reasonsOf({ texts: [julian] }).added).toEqual([1]);
  });

  test("Julian's approval from before the last push doesn't count; one of an older head with an identical diff does", () => {
    expect(reasonsOf({ texts: [julian], forcePushedAt: [ago(10)] }).added).toEqual([]);
    const same = { [head.slice(0, 7)]: "p1", [head]: "p1" };
    expect(reasonsOf({ texts: [julian], forcePushedAt: [ago(10)] }, same).added).toEqual([]);
    const older = said(`Julian: approved on head \`${old.slice(0, 7)}\``);
    const rebased = { [old.slice(0, 7)]: "p1", [head]: "p1" };
    expect(reasonsOf({ texts: [older], forcePushedAt: [ago(10)] }, rebased).added).toEqual([1]);
  });

  test("outside his limits, on his own branch or a release branch, it needs Liam", () => {
    const decision = pass(
      snapshot({ pulls: [pull(1, { texts: [julian], files: ["turbo.json"], fileNet: {} })] }),
    );
    expect(enqueued(decision)).toEqual([]);
    expect(reasonsOf({ texts: [julian], branch: "julian/HAL-1-x" }).added).toEqual([]);
    expect(reasonsOf({ texts: [julian], branch: "changeset-release/main" }).added).toEqual([]);
  });

  test("his rebase-only re-approval of a head Liam approved counts on Liam's paths (HAL-18459)", () => {
    const texts = [
      said(`Liam: approved on head \`${old.slice(0, 7)}\``, 40),
      said(
        `Julian: re-approved on head \`${head.slice(0, 7)}\` (rebase only, range-diff vs \`${old.slice(0, 7)}\`)`,
        20,
      ),
    ];
    const lockfile = { files: ["pnpm-lock.yaml"], fileNet: {}, texts };
    expect(reasonsOf(lockfile).added).toEqual([1]);
    const fence = { ...lockfile, files: ["packages/x/src/sandbox/fence.ts"] };
    expect(reasonsOf(fence).added).toEqual([]);
    expect(reasonsOf({ ...lockfile, branch: "changeset-release/main" }).added).toEqual([]);
    expect(reasonsOf({ ...lockfile, filesTotal: 2 }).added).toEqual([]);
    expect(reasonsOf({ ...lockfile, texts: texts.slice(1) }).added).toEqual([]);
  });

  test("Liam's change request on the current head isn't overruled by Julian", () => {
    const request = said("Liam: changes requested, please fix the guard", 20);
    expect(
      reasonsOf({ texts: [request, said(`Julian: approved on head \`${head.slice(0, 7)}\``, 10)] })
        .added,
    ).toEqual([]);
  });
});

verifies("paperclip.merge-control-author-liam", () => {
  test("Liam's own approval of his pull request doesn't count", () => {
    expect(reasonsOf({ branch: "liam/HAL-1-x" }).added).toEqual([]);
  });

  test("Julian's approval with Author: Liam counts on any path", () => {
    const signed = said(`Julian: approved on head \`${head.slice(0, 7)}\`\nAuthor: Liam`);
    const files = ["turbo.json"];
    expect(
      reasonsOf({ branch: "liam/HAL-1-x", texts: [signed], files, fileNet: {} }).added,
    ).toEqual([1]);
    const unsigned = said(`Julian: approved on head \`${head.slice(0, 7)}\``);
    expect(
      reasonsOf({ branch: "liam/HAL-1-x", texts: [unsigned], files, fileNet: {} }).added,
    ).toEqual([]);
  });
});

verifies("paperclip.merge-control-change-request", () => {
  test("a change request newer than the approval keeps it out", () => {
    const texts = [
      said(`Liam: approved on head \`${head.slice(0, 7)}\``, 30),
      said("Julian: [blocker] needs a fix in the gate", 10),
    ];
    expect(reasonsOf({ texts }).added).toEqual([]);
  });

  test("an approval saying the blocking point is fixed, or a non-blocking note, doesn't hold it", () => {
    const fixed = said(
      `Liam: approved on head \`${head.slice(0, 7)}\`. The blocking point is fixed.`,
    );
    const note = [
      said(`Liam: approved on head \`${head.slice(0, 7)}\``, 30),
      said("Liam: non-blocking nit on the wording", 10),
    ];
    expect(reasonsOf({ texts: [fixed] }).added).toEqual([1]);
    expect(reasonsOf({ texts: note }).added).toEqual([1]);
  });

  test("a blocking word in a comment with a signed approval makes it a change request (HAL-17946)", () => {
    const body = `Liam: the blocking question from yesterday: answered.\n\nLiam: approved on head \`${head.slice(0, 7)}\``;
    expect(reasonsOf({ texts: [said(body)] }).added).toEqual([]);
  });

  test("a signed line naming a head that rejects it holds it", () => {
    const texts = [
      said(`Liam: approved on head \`${head.slice(0, 7)}\``, 30),
      said(`Liam: ${head.slice(0, 7)} not approved yet, reject`, 10),
    ];
    expect(reasonsOf({ texts }).added).toEqual([]);
  });

  test("only the same reviewer's later approval or a push clears a change request (HAL-19778)", () => {
    const routine = { files: ["apps/cli/src/commands/run.ts"], filesTotal: 1, fileNet: {} };
    const h7 = head.slice(0, 7);
    const request = [
      said(`Liam: approved on head \`${h7}\``, 40),
      said(`Liam: changes requested on head \`${h7}\``, 30),
    ];
    for (const other of ["Nora", "Julian"]) {
      const texts = [...request, said(`${other}: approved on head \`${h7}\``, 20)];
      expect(reasonsOf({ ...routine, texts }).added).toEqual([]);
      const each = pull(1, { ...routine, texts });
      const approval = approvalOf(each, "halonic-dev", {}).approval;
      expect(changeRequestOf(each, "halonic-dev", approval)?.who).toBe("Liam");
    }
    const again = [...request, said(`Liam: approved on head \`${h7}\``, 20)];
    expect(reasonsOf({ ...routine, texts: again }).added).toEqual([1]);
    const pushed = [...request, said(`Nora: approved on head \`${h7}\``, 10)];
    expect(reasonsOf({ ...routine, texts: pushed, forcePushedAt: [ago(20)] }).added).toEqual([1]);
    const julianAsked = [
      said(`Julian: approved on head \`${h7}\``, 40),
      said("Julian: [blocker] needs a fix in the gate", 30),
      said(`Liam: approved on head \`${h7}\``, 20),
    ];
    expect(reasonsOf({ ...routine, texts: julianAsked }).added).toEqual([]);
  });

  test("another reviewer's own request and approval don't hide Liam's request in words (HAL-19778)", () => {
    const routine = { files: ["apps/cli/src/commands/run.ts"], filesTotal: 1, fileNet: {} };
    const h7 = head.slice(0, 7);
    for (const other of ["Julian", "Nora"]) {
      const texts = [
        said(`Liam: approved on head \`${h7}\``, 40),
        said("Liam: needs a fix in the gate before this goes in", 30),
        said(`${other}: please fix the wording in the reason`, 20),
        said(`${other}: approved on head \`${h7}\``, 10),
      ];
      expect(reasonsOf({ ...routine, texts }).added).toEqual([]);
      const each = pull(1, { ...routine, texts });
      const approval = approvalOf(each, "halonic-dev", {}).approval;
      expect(changeRequestOf(each, "halonic-dev", approval)?.who).toBe("Liam");
    }
  });

  test("an approval carried over a rebase from before the push doesn't clear a change request (HAL-19778)", () => {
    const routine = { files: ["apps/cli/src/commands/run.ts"], filesTotal: 1, fileNet: {} };
    const o7 = old.slice(0, 7);
    const rebased = { [o7]: "p1", [head]: "p1" };
    const asked = said(`Liam: changes requested on head \`${o7}\``, 30);
    for (const texts of [
      [said(`Liam: approved on head \`${o7}\``, 40), asked],
      [said(`Julian: approved on head \`${o7}\``, 40), asked],
      [asked, said(`Nora: approved on head \`${o7}\``, 25)],
    ]) {
      expect(reasonsOf({ ...routine, texts, forcePushedAt: [ago(20)] }, rebased).added).toEqual([]);
    }
  });

  test("a queued pull request with a new change request comes out", () => {
    const texts = [
      said(`Liam: approved on head \`${head.slice(0, 7)}\``, 30),
      said("Liam: changes requested", 5),
    ];
    const decision = pass(snapshot({ pulls: [pull(1, { texts })], queue: [entry(1, 1)] }));
    expect(actionsOf(decision, "dequeue").map((each) => each.reason)).toEqual(["change-request"]);
  });
});

verifies("paperclip.routine-review", () => {
  const nora = said(`Nora: approved on head \`${head.slice(0, 7)}\``);
  const routine = { files: ["apps/cli/src/commands/run.ts"], filesTotal: 1, fileNet: {} };

  test("Nora's signed approval counts on a routine pull request (HAL-19283)", () => {
    expect(reasonsOf({ ...routine, texts: [nora] }).added).toEqual([1]);
    expect(approvalOf(pull(1, { ...routine, texts: [nora] }), "halonic-dev", {}).approval).toEqual({
      ok: true,
      nora: true,
      at: nora.at,
    });
  });

  test("it doesn't count on packages/core/, a public interface, her own branch or from before the last push", () => {
    const core = { files: ["packages/core/app/src/a.ts"], filesTotal: 1, fileNet: {} };
    expect(reasonsOf({ ...core, texts: [nora] }).added).toEqual([]);
    expect(approvalOf(pull(1, { ...core, texts: [nora] }), "halonic-dev", {}).reasons).toContain(
      "Nora approved, but it is outside her scope (touches packages/core/app/src/a.ts): needs Julian or Liam",
    );
    const api = { ...routine, files: ["packages/studio/features/inbox/src/api.ts"] };
    expect(reasonsOf({ ...api, texts: [nora] }).added).toEqual([]);
    expect(reasonsOf({ ...routine, texts: [nora], branch: "nora/HAL-1-x" }).added).toEqual([]);
    expect(reasonsOf({ ...routine, texts: [nora], forcePushedAt: [ago(10)] }).added).toEqual([]);
  });

  test("a renamed file counts by its old path: out of reviewer-paths.ts, or unknown, needs Liam", () => {
    const moved = "tooling/paperclip/src/routing/paths.ts";
    const renamed = (old: string | null) => ({
      files: [moved],
      filesTotal: 1,
      fileNet: {},
      previousPaths: { [moved]: old },
    });
    const julian = said(`Julian: approved on head \`${head.slice(0, 7)}\``);
    const out = renamed("tooling/paperclip/src/reviewer-paths.ts");
    expect(reasonsOf({ ...out, texts: [julian] }).added).toEqual([]);
    expect(reasonsOf({ ...out, texts: [nora] }).added).toEqual([]);
    expect(outsideJulianScope(pull(1, renamed(null)))).toBe(
      `renames ${moved} from a path that isn't known`,
    );
    expect(reasonsOf({ ...renamed("tooling/paperclip/src/a.ts"), texts: [nora] }).added).toEqual([
      1,
    ]);
  });

  test("it doesn't count on a pull request the team didn't write, or a sensitive one", () => {
    const fork = { ...routine, texts: [nora], crossRepository: true };
    expect(reasonsOf(fork).added).toEqual([]);
    expect(outsideNoraScope(pull(1, fork))).toBe("not written by the team");
    const bot = { ...routine, texts: [nora], branch: "dependabot/npm_and_yarn/acme-1.2.3" };
    expect(reasonsOf(bot).added).toEqual([]);
    // A team-named branch opened by another account: the origin check uses the fetched author (HAL-19779).
    const outsider = { ...routine, texts: [nora], author: "acme-contributor" };
    expect(reasonsOf(outsider).added).toEqual([]);
    expect(outsideNoraScope(pull(1, outsider))).toBe("not written by the team");
    expect(outsideNoraScope(pull(1, { ...routine, author: null }))).toBe("not written by the team");
    const trust = { ...routine, texts: [nora], labels: ["area: trust and sandbox"] };
    expect(outsideNoraScope(pull(1, trust))).toBe("a security or release pull request");
  });

  test("Nora's change request holds a pull request Julian approved", () => {
    const texts = [
      said(`Julian: approved on head \`${head.slice(0, 7)}\``, 30),
      said("Nora: [major] needs a fix in the reader", 10),
    ];
    expect(reasonsOf({ ...routine, texts }).added).toEqual([]);
  });
});
