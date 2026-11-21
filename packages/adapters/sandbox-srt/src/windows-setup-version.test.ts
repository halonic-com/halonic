import { readFile } from "node:fs/promises";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import record from "../windows-setup-version.json" with { type: "json" };

/** The sandbox-runtime version `pnpm-workspace.yaml` pins for the repository. */
async function pinnedSrt(): Promise<string | undefined> {
  const workspace = await readFile(
    new URL("../../../../pnpm-workspace.yaml", import.meta.url),
    "utf8",
  );
  return /^ {2}"@anthropic-ai\/sandbox-runtime": (\S+)$/m.exec(workspace)?.[1];
}

verifies("sandbox-srt.windows-setup-version", () => {
  describe("the recorded Windows setup version", () => {
    it("is for the pinned sandbox-runtime, so a bump has to record it again", async () => {
      expect(record.srt).toBe(await pinnedSrt());
    });

    it("is a whole number above zero", () => {
      expect(Number.isInteger(record.setupVersion)).toBe(true);
      expect(record.setupVersion).toBeGreaterThan(0);
    });
  });
});
