import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { judgeApprovals, signedApprovals } from "../pr-tools/approvals.ts";
import type { ReviewRole } from "../reviewer-paths.ts";
import { approvalOf } from "./approval.ts";
import { ago, enqueued, headOf, pass, pull, said, snapshot } from "./merge-control.test-helper.ts";

const head = headOf(1);
const old = headOf(1, 1);
const nora = said(`Nora: approved on head \`${head.slice(0, 7)}\``);

// The helper's default file is in packages/core/, which is outside Nora's scope.
const view = "packages/studio/features/inbox/src/view.tsx";
const routine = { files: [view], fileNet: { [view]: 30 } };

function addedWith(changes: Parameters<typeof pull>[1], patchIds = {}): number[] {
  return enqueued(pass(snapshot({ pulls: [pull(1, { ...routine, ...changes })], patchIds })));
}

verifies("paperclip.merge-control-nora-scope", () => {
  test("Nora's approval counts within the routine reviewer's scope, also on Liam's or Julian's branch", () => {
    expect(addedWith({ texts: [nora] })).toEqual([1]);
    expect(addedWith({ texts: [nora], branch: "liam/HAL-1-x" })).toEqual([1]);
    expect(addedWith({ texts: [nora], branch: "julian/HAL-1-x" })).toEqual([1]);
    expect(
      approvalOf(pull(1, { ...routine, texts: [nora] }), "halonic-dev", {}).approval,
    ).toMatchObject({
      ok: true,
      nora: true,
    });
  });

  test("outside Julian's limits, on her own branch or a release branch, it needs Liam", () => {
    for (const file of ["turbo.json", "tooling/check/x.ts", "pnpm-lock.yaml"]) {
      expect(addedWith({ texts: [nora], files: [file], fileNet: {} })).toEqual([]);
    }
    expect(addedWith({ texts: [nora], branch: "nora/HAL-1-x" })).toEqual([]);
    expect(addedWith({ texts: [nora], branch: "changeset-release/main" })).toEqual([]);
    expect(addedWith({ texts: [nora], filesTotal: 2 })).toEqual([]);
    const { reasons } = approvalOf(
      pull(1, { texts: [nora], files: ["turbo.json"], fileNet: {} }),
      "halonic-dev",
      {},
    );
    expect(reasons[0]).toMatch(
      /^Nora approved, but it is outside her scope \(touches turbo\.json\)/,
    );
  });

  test("core, host, the spec helper and a public interface are outside her scope, not Julian's", () => {
    const julian = said(`Julian: approved on head \`${head.slice(0, 7)}\``);
    for (const file of [
      "packages/core/x.ts",
      "packages/host/x.ts",
      "packages/testing/spec/x.ts",
      "packages/foo/src/index.ts",
    ]) {
      expect(addedWith({ texts: [nora], files: [file], fileNet: {} })).toEqual([]);
      expect(addedWith({ texts: [julian], files: [file], fileNet: {} })).toEqual([1]);
    }
    const { reasons } = approvalOf(
      pull(1, { texts: [nora], files: ["packages/core/engine/src/x.ts"], fileNet: {} }),
      "halonic-dev",
      {},
    );
    expect(reasons[0]).toMatch(
      /^Nora approved, but it is outside her scope \(touches packages\/core\/engine\/src\/x\.ts\)/,
    );
  });

  test("Julian's exceptions don't widen hers: Author: Liam, or a rebase-only re-approval", () => {
    const authorLiam = said(`Nora: approved on head \`${head.slice(0, 7)}\`\nAuthor: Liam`);
    const liamPath = { branch: "liam/HAL-1-x", files: ["turbo.json"], fileNet: {} };
    expect(addedWith({ ...liamPath, texts: [authorLiam] })).toEqual([]);
    const texts = [
      said(`Liam: approved on head \`${old.slice(0, 7)}\``, 40),
      said(
        `Nora: re-approved on head \`${head.slice(0, 7)}\` (rebase only, range-diff vs \`${old.slice(0, 7)}\`)`,
        20,
      ),
    ];
    expect(addedWith({ files: ["pnpm-lock.yaml"], fileNet: {}, texts })).toEqual([]);
  });

  test("it carries over an identical diff and not over a push that changed it", () => {
    expect(addedWith({ texts: [nora], forcePushedAt: [ago(10)] })).toEqual([]);
    const same = { [head.slice(0, 7)]: "p1", [head]: "p1" };
    expect(addedWith({ texts: [nora], forcePushedAt: [ago(10)] }, same)).toEqual([1]);
  });

  test("other names don't count, and Liam's change request isn't overruled by Nora", () => {
    const nina = said(`Nina: approved on head \`${head.slice(0, 7)}\``);
    expect(addedWith({ texts: [nina] })).toEqual([]);
    const request = said("Liam: changes requested, please fix the guard", 20);
    const later = said(`Nora: approved on head \`${head.slice(0, 7)}\``, 10);
    expect(addedWith({ texts: [request, later] })).toEqual([]);
  });

  test("pr_status counts Nora's approval only for the routine reviewer's role, without Author: Liam", () => {
    const signed = signedApprovals([
      { body: "Nora: approved on head `bb12791`", author_association: "MEMBER" },
      { body: "Nina: approved on head `bb12791`", author_association: "MEMBER" },
    ]);
    expect(signed).toEqual([{ by: "Nora", head: "bb12791" }]);
    const fullHead = "bb12791aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const judge = (author: string, role: ReviewRole) =>
      judgeApprovals(signed, {
        head: fullHead,
        author,
        reviewer: role === "code-reviewer" ? "liam" : "julian",
        role,
      })[0]?.counts;
    expect(judge("owen", "routine-reviewer")).toBe(true);
    expect(judge("liam", "routine-reviewer")).toBe(true);
    expect(judge("owen", "second-reviewer")).toBe(false);
    expect(judge("owen", "code-reviewer")).toBe(false);
    expect(judge("liam", "code-reviewer")).toBe(false);
    expect(judge("nora", "routine-reviewer")).toBe(false);
  });
});
