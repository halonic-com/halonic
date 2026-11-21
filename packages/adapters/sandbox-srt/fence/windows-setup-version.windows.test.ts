import { execFile } from "node:child_process";
import {
  getWindowsSandboxUserStatusAsync,
  resolveSrtWin,
  VENDORED_SRT_WIN_EXE,
} from "@anthropic-ai/sandbox-runtime";
import { describe, expect, it } from "vitest";
import record from "../windows-setup-version.json" with { type: "json" };

/** `MarkerVersion` under srt's machine key, in the 64-bit view, or null when it isn't there. */
function registryMarker(): Promise<number | null> {
  const key = String.raw`HKLM\SOFTWARE\sandbox-runtime`;
  const args = ["query", key, "/v", "MarkerVersion", "/reg:64"];
  return new Promise((resolve) => {
    execFile("reg.exe", args, { windowsHide: true }, (error, stdout) => {
      const dword = /MarkerVersion\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(stdout);
      resolve(error === null && dword?.[1] !== undefined ? Number.parseInt(dword[1], 16) : null);
    });
  });
}

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
 *
 * The installer's rollback guard (`apps/studio/src-tauri/windows/setup-guard.ps1`,
 * HAL-5404 S3) reads the marker from the registry rather than run `srt-win`,
 * so the second test holds that place to what `srt-win` reports.
 */
describe("srt's Windows setup version", () => {
  it("is the recorded one, needed and installed", async () => {
    const user = await getWindowsSandboxUserStatusAsync({
      srtWin: resolveSrtWin({ path: VENDORED_SRT_WIN_EXE }),
    });
    expect(user.setupVersion).toBe(record.setupVersion);
    expect(user.markerVersion).toBe(record.setupVersion);
  });

  it("is on the machine where the installer's rollback guard reads it", async () => {
    const user = await getWindowsSandboxUserStatusAsync({
      srtWin: resolveSrtWin({ path: VENDORED_SRT_WIN_EXE }),
    });
    expect(await registryMarker()).toBe(user.markerVersion);
  });
});
