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

// The guard's answers to each marker run on Windows, in the installer job
// (windows/test-setup-guard.ps1); these hold the wiring around it.
verifies("studio.installer-rollback-guard", () => {
  it("reads srt's marker from the registry and starts no program", () => {
    const guard = read("windows/setup-guard.ps1");
    expect(guard).toContain("-KeyPath 'SOFTWARE\\sandbox-runtime'");
    expect(guard).toContain("GetValue('MarkerVersion')");
    expect(guard).toContain("[Microsoft.Win32.RegistryView]::Registry64");
    expect(guard).not.toMatch(/Start-Process|Invoke-Expression|^\s*& |= & /m);
    expect(guard).toContain("$setupVersionBeforeRecords = '3'");
  });

  it("runs its own copy of the guard, from the plugins folder", () => {
    const check = nsisFunction("CheckSetupVersion");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(check).toContain('File "/oname=$PLUGINSDIR\\setup-guard.ps1" "${SETUPGUARD}"');
    expect(check).toContain(
      '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\setup-guard.ps1"',
    );
    expect(check).not.toContain("$INSTDIR");
  });

  it("goes back after an update only when the guard says 0", () => {
    const wait = nsisFunction("WaitForStartOrGoBack");
    const guard = wait.indexOf("Call CheckSetupVersion");
    const goBack = wait.indexOf("/ROLLBACK");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(guard).toBeGreaterThan(wait.indexOf("${LoopUntil} $3 >= 180"));
    expect(goBack).toBeGreaterThan(guard);
    expect(wait).toContain('-RecordFile "$1\\updates\\installers\\Halonic-$OldVersion.srt-setup"');
    const refused = wait.slice(guard, goBack);
    expect(refused).toMatch(/\$\{If\} \$R1 <> 0[\s\S]*Call LogUpdateLine\s+Return/);
  });

  it("stops an installer before any page when the guard says 1", () => {
    const init = nsisFunction(".onInit");
    expect(init).toContain("Call RefuseOlderSetupVersion");
    const refuse = nsisFunction("RefuseOlderSetupVersion");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(refuse).toContain('"-SetupVersion ${SRTSETUPVERSION}"');
    expect(refuse).toMatch(/\$\{ElseIf\} \$R1 = 1[\s\S]*SetErrorLevel 2\s+Quit/);
  });

  it("keeps the setup version beside the kept installer, and the shell prunes both", () => {
    const keep = nsisFunction("KeepInstaller");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(keep).toContain('"$1\\updates\\installers\\Halonic-${VERSION}.srt-setup"');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(keep).toContain('FileWrite $3 "${SRTSETUPVERSION}"');
    expect(read("src/updates_way_back.rs")).toContain('rest.strip_suffix(".srt-setup")');
  });

  it("packs the recorded setup version, and stops the build without a whole number", () => {
    const build = read("windows/build-installer.ps1");
    expect(build).toContain("packages/adapters/sandbox-srt/windows-setup-version.json");
    expect(build).toMatch(/-notmatch '\^\[1-9\]\[0-9\]\*\$'\) \{ throw/);
    expect(build).toContain("$env:HALONIC_SRT_SETUP_VERSION = $setupVersion");
    const pack = build.indexOf("pnpm exec tauri bundle");
    expect(build.indexOf("$env:HALONIC_SETUP_GUARD")).toBeLessThan(pack);
  });
});
