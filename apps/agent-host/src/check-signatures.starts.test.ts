import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Every program the signature check starts goes through this fake, so the
// test sees each start and nothing really runs.
const started = vi.hoisted(
  () => [] as { file: string; args: readonly string[]; program: string | undefined }[],
);
vi.mock("node:child_process", () => ({
  execFileSync: (file: string, args: readonly string[], options: { env: NodeJS.ProcessEnv }) => {
    started.push({ file, args, program: options.env["HALONIC_SIGNED_PROGRAM"] });
    return "Valid\r\n";
  },
}));

const peHeader = 0x80;
const securityEntry = peHeader + 24 + 112 + 4 * 8;

/** A minimal signed 64-bit Windows program. */
function signedProgram(): Uint8Array {
  const bytes = new Uint8Array(0x420);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x5a4d, true);
  view.setUint32(0x3c, peHeader, true);
  view.setUint32(peHeader, 0x00004550, true);
  view.setUint16(peHeader + 24, 0x20b, true);
  view.setUint32(peHeader + 24 + 108, 16, true);
  view.setUint32(securityEntry, 0x400, true);
  view.setUint32(securityEntry + 4, 0x20, true);
  view.setUint32(0x400, 0x20, true);
  view.setUint16(0x404, 0x0200, true);
  view.setUint16(0x406, 0x0002, true);
  return bytes;
}

const platform = Object.getOwnPropertyDescriptor(process, "platform");
const argv = process.argv;
const folder = mkdtempSync(join(tmpdir(), "check-signatures-starts-"));

afterAll(() => {
  if (platform !== undefined) Object.defineProperty(process, "platform", platform);
  process.argv = argv;
  process.exitCode = undefined;
  rmSync(folder, { recursive: true, force: true });
});

describe("what the installer's signature check starts (HAL-20055)", () => {
  it("is only PowerShell's Get-AuthenticodeSignature, with the program in the environment", async () => {
    // Only Windows asks Authenticode, so pretend to be there to see every start.
    Object.defineProperty(process, "platform", { value: "win32" });
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const program = join(folder, "signed.exe");
    writeFileSync(program, signedProgram());
    process.argv = [argv[0] ?? "node", "check-signatures.ts", folder];
    await import("../scripts/check-signatures.ts");
    expect(started).toEqual([
      {
        file: "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "(Get-AuthenticodeSignature -LiteralPath $env:HALONIC_SIGNED_PROGRAM).Status.ToString()",
        ],
        program,
      },
    ]);
    expect(process.exitCode).toBeUndefined();
  });
});
