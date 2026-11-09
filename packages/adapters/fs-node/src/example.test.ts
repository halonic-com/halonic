import { afterAll, describe, expect, it } from "vitest";
import { runExample } from "../examples/workspace-and-runs.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

describe("the README example", () => {
  it("runs and gives the results its comments promise", async () => {
    expect(await runExample(await tempFolder())).toEqual({
      files: ["workflows/greet.yaml"],
      version: expect.stringMatching(/^sha256:[0-9a-f]{16}$/),
      appended: true,
      conflict: true,
      status: "waiting",
      snapshotSeq: 2,
      eventsToReplay: [3],
    });
  });
});
