import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { reviewerRoleFor } from "../reviewer-paths.ts";
import { manifestFileOf } from "../reviewer-paths-manifest.ts";
import { approvalOf } from "./approval.ts";
import { enqueued, headOf, pass, pull, said, snapshot } from "./merge-control.test-helper.ts";

const head = headOf(1);
const liam = said(`Liam: approved on head \`${head.slice(0, 7)}\``);
const julian = said(`Julian: approved on head \`${head.slice(0, 7)}\``);
const manifest = "tooling/paperclip/src/plugin/manifest.ts";
const changed = { files: [manifest], fileNet: { [manifest]: 10 } };

function addedWith(changes: Parameters<typeof pull>[1]): number[] {
  return enqueued(pass(snapshot({ pulls: [pull(1, { ...changed, ...changes })] })));
}

verifies("paperclip.manifest-julian", () => {
  test("the manifest modules are the plugin deployer's list, tests excluded", () => {
    for (const file of [
      "tooling/paperclip/src/plugin/pr-tool-declarations.ts",
      "tooling/paperclip/src/plugin/queue-settings.ts",
      "tooling/paperclip/src/seats/plugin/manifest.ts",
      "tooling/paperclip/src/front-bot/settings.ts",
      "tooling/paperclip/src/worker-agents/keys.ts",
      "tooling/paperclip/src/worker-agents/tables.ts",
      "tooling/paperclip/src/plugin/front-bot-notes.ts",
      "tooling/paperclip/src/plugin/version.ts",
    ]) {
      expect(manifestFileOf(["docs/x.md", file])).toBe(file);
    }
    expect(manifestFileOf(["tooling/paperclip/src/plugin/queue-settings.test.ts"])).toBeUndefined();
    expect(manifestFileOf(["tooling/paperclip/src/plugin/worker.ts"])).toBeUndefined();
  });

  test("a small manifest change goes to Julian, never to the routine reviewer alone", () => {
    const routed = { files: ["tooling/paperclip/src/plugin/front-bot-notes.ts"], changedLines: 12 };
    expect(reviewerRoleFor({ ...routed, sensitive: false })).toBe("second-reviewer");
  });

  test("Liam's approval of a manifest change waits for Julian's on the head too", () => {
    expect(addedWith({ texts: [liam] })).toEqual([]);
    const { reasons } = approvalOf(pull(1, { ...changed, texts: [liam] }), "halonic-dev", {});
    expect(reasons).toEqual([
      `changes a plugin manifest (${manifest}): needs Julian's approval on head ${head.slice(0, 9)} too`,
    ]);
    expect(addedWith({ texts: [liam, julian] })).toEqual([1]);
    expect(addedWith({ texts: [julian] })).toEqual([1]);
  });

  test("on Julian's own branch a manifest change goes to the board", () => {
    const own = pull(1, { ...changed, texts: [liam], branch: "julian/HAL-1-x" });
    expect(addedWith({ texts: [liam], branch: "julian/HAL-1-x" })).toEqual([]);
    expect(approvalOf(own, "halonic-dev", {}).reasons[0]).toContain("for the board");
  });
});
