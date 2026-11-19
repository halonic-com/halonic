// Loopback-mode probe of native srt on Windows (HAL-5398, nit 4 of HAL-10590).
// Halonic checks srt's install with loopback closed. This asks srt the same
// way the backend's check does, and also reads the network filters and runs
// srt's own fence check, then writes what each answered as one JSON file:
//   node scripts/windows-loopback-probe.mjs <label> <out.json>
// Run it elevated and not elevated (scripts/windows-basic-user.ps1): the
// question is whether a check without elevation still sees an install made
// with loopback open, or only a session start does.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkWindowsDependenciesAsync,
  getWindowsWfpStatusAsync,
  resolveSrtWin,
  VENDORED_SRT_WIN_EXE,
  verifyWindowsWfpEgress,
} from "@anthropic-ai/sandbox-runtime";

const [label = "unlabelled", out = "windows-loopback-results.json"] = process.argv.slice(2);
const srtWin = resolveSrtWin({ path: VENDORED_SRT_WIN_EXE });

const settle = async (run) => {
  try {
    return { value: await run() };
  } catch (error) {
    return { error: { code: error?.code ?? null, message: String(error?.message ?? error) } };
  }
};

// The token this process runs under: is Administrators enabled, and at
// which integrity level.
const whoami = join(process.env["SystemRoot"] ?? "", "System32", "whoami.exe");
const groups = execFileSync(whoami, ["/groups", "/fo", "csv", "/nh"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((line) => /S-1-5-32-544|S-1-16-/.test(line));

const result = {
  label,
  groups,
  wfpStatus: await settle(() => getWindowsWfpStatusAsync({ srtWin })),
  check: await settle(async () => {
    const check = await checkWindowsDependenciesAsync({ srtWin, allowLoopback: false });
    const mismatch = check.loopbackMismatch ?? null;
    // The same mapping as windowsSandboxState in src/machine.ts.
    let state = "ok";
    if (check.errors.length > 0) state = mismatch === null ? "setup-needed" : "setup-conflict";
    return { state, errors: check.errors, loopbackMismatch: mismatch };
  }),
  verify: await settle(() => verifyWindowsWfpEgress({ srtWin, allowLoopback: false })),
};

const json = JSON.stringify(result, null, 2);
writeFileSync(out, json);
console.log(json);
