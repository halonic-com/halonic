import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";
import { errorsOf, expectedError, parityLoadLimitMs } from "../test/parity-cases.spec.ts";

verifies("workspace.file-rules", () => {
  it(
    "reports a delegation loop once, on its first agent, with the old loader's error",
    async () => {
      expect(await errorsOf("agent/delegation-loop")).toEqual([
        expectedError("agent/delegation-loop"),
      ]);
    },
    parityLoadLimitMs,
  );

  it(
    "fails a copy whose id is another file's for its id, not as a repeated id",
    async () => {
      // mock-copy.yaml says id: mock; the old loader called mock.yaml a duplicate
      // (parity difference id-differs-from-place, HAL-14277).
      expect(await errorsOf("provider/duplicate-id")).toEqual([
        {
          file: "providers/mock-copy.yaml",
          path: "id",
          line: 1,
          message:
            "The id is mock, but the file is mock-copy.yaml. Use the same name in both, or leave id out.",
        },
      ]);
    },
    parityLoadLimitMs,
  );

  it(
    "reports a workspace without workspace.yaml",
    async () => {
      expect(await errorsOf("workspace/missing-file")).toEqual([
        { file: "workspace.yaml", path: "", line: 1, message: "Missing workspace.yaml" },
      ]);
    },
    parityLoadLimitMs,
  );

  it("doesn't call a workspace.yaml that fails its own checks missing", async () => {
    const workspace = await loadWorkspace(new MemorySource({ "workspace.yaml": "name: [\n" }));
    expect(workspace.issues.map((issue) => issue.source)).toEqual(["syntax"]);
  });
});
