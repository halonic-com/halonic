import { execFileSync } from "node:child_process";
import { type AuthenticodeStatus, checkPrograms } from "../src/build/program-signatures.ts";

/**
 * `node apps/agent-host/scripts/check-signatures.ts <folder>`: checks every
 * Windows program and DLL in the folder, such as an unpacked installer, and
 * fails when one has a security directory that doesn't hold a valid signature
 * (HAL-20055). Unsigned passes: our own programs ship unsigned (HAL-16758).
 */

const folder = process.argv[2];
if (folder === undefined) {
  throw new Error("usage: check-signatures.ts <folder>");
}

// The path goes in through the environment, so no quoting can turn it into a command.
const authenticode: AuthenticodeStatus = (path) =>
  process.platform === "win32"
    ? execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "(Get-AuthenticodeSignature -LiteralPath $env:HALONIC_SIGNED_PROGRAM).Status.ToString()",
        ],
        { encoding: "utf8", env: { ...process.env, HALONIC_SIGNED_PROGRAM: path } },
      ).trim()
    : undefined;

const results = checkPrograms(folder, authenticode);
for (const { path, ok, detail } of results) {
  console.log(`${ok ? "ok  " : "FAIL"} ${path}: ${detail}`);
}
const failed = results.filter(({ ok }) => !ok).length;
if (results.length === 0) {
  console.error(`No Windows programs in ${folder}.`);
  process.exitCode = 1;
} else if (failed > 0) {
  console.error(
    `${failed} of ${results.length} programs have a security directory without a valid signature.`,
  );
  process.exitCode = 1;
} else {
  console.log(`All ${results.length} programs are unsigned or validly signed.`);
}
