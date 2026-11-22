import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");
const read = (path: string) => readFileSync(join(shellFolder, path), "utf8");

/** The body of `Function <name>` in the installer template. */
function nsisFunction(name: string): string {
  const text = read("windows/installer.nsi");
  const start = text.indexOf(`Function ${name}\n`);
  expect(start).toBeGreaterThan(-1);
  return text.slice(start, text.indexOf("FunctionEnd", start));
}

// The guard's answers to each marker run on Windows (windows/test-setup-guard.ps1, the
// `-SetUpAgain` cases), and the number's comparison in the update-state crate's Rust tests;
// these hold the wiring around them.
verifies("studio.update-setup-again", () => {
  it("compares the manifest's number with this build's one record", () => {
    const crate = read("crates/update-state/src/setup_version.rs");
    expect(crate).toContain(
      '"../../../../../../packages/adapters/sandbox-srt/windows-setup-version.json"',
    );
    expect(crate).toContain('.pointer("/halonic/srtWindowsSetupVersion")');
    expect(crate).toContain("if found > this_build");
  });

  it("passes /SANDBOX=again only for an update that raises it, on Windows", () => {
    const check = read("src/updates_check.rs");
    expect(check).toContain('const SANDBOX_AGAIN: &str = "/SANDBOX=again";');
    expect(check).toContain(
      "cfg!(windows) && raises_setup_version(&update.raw_json, this_build_setup_version())",
    );
    expect(check).toContain("(sets_up_again(update), SANDBOX_AGAIN)");
    expect(read("src/updates.rs")).toContain(".installer_args(installer_args(&update, relaunch))");
  });

  it("runs the sandbox step for an update only where the guard says the marker is older", () => {
    const init = nsisFunction(".onInit");
    expect(init).toMatch(/\$\{ElseIf\} \$R0 == "again"\s+\$\{AndIf\} \$UpdateMode = 1/);
    expect(init).toContain("Call SetUpAgain");
    const again = nsisFunction("SetUpAgain");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(again).toContain('"-SetUpAgain -SetupVersion ${SRTSETUPVERSION}"');
    expect(again).toMatch(/Call CheckSetupVersion\s+\$\{If\} \$R1 = 0\s+StrCpy \$SandboxState/);
    expect(again).toMatch(
      /\$\{If\} \$\{Silent\}\s+\$\{AndIf\} \$R1 = 0\s+(?:;[^\n]*\s+)?StrCpy \$SandboxOutcome "skipped"\s+Return/,
    );
  });

  it("sets it up again only for a marker below the installer's own number", () => {
    const guard = read("windows/setup-guard.ps1");
    const check = guard.slice(guard.indexOf("function Invoke-SetUpAgainCheck"));
    expect(check).toContain("if ($marker -lt $wanted) { return @(0,");
    expect(guard).toMatch(/if \(\$SetUpAgain\) \{\s+\$code, \$reason = Invoke-SetUpAgainCheck/);
  });
});
