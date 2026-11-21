import {
  getWindowsSandboxUserStatusAsync,
  resolveSrtWin,
  VENDORED_SRT_WIN_EXE,
} from "@anthropic-ai/sandbox-runtime";
import { describe, expect, it } from "vitest";
import record from "../windows-setup-version.json" with { type: "json" };

/**
 * The recorded setup version against the real `srt-win` (HAL-5404). The
 * release's updater manifest carries the recorded number, so it must be the
 * one this srt needs. Run by the `sandbox-windows` CI job after srt's install
 * (`vitest.fence-windows.config.ts`), which runs for every change to the
 * lockfile, so for every bump of sandbox-runtime.
 *
 * It checks the Windows example of `sandbox-srt.windows-setup-version` but
 * isn't wrapped in `verifies`: the trace check reads only the package's
 * result file from Linux, where this file doesn't run.
 */
describe("srt's Windows setup version", () => {
  it("is the recorded one, needed and installed", async () => {
    const user = await getWindowsSandboxUserStatusAsync({
      srtWin: resolveSrtWin({ path: VENDORED_SRT_WIN_EXE }),
    });
    expect(user.setupVersion).toBe(record.setupVersion);
    expect(user.markerVersion).toBe(record.setupVersion);
  });
});
