// biome-ignore-all lint/suspicious/noTemplateCurlyInString: NSIS defines and variables, written literally
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const installer = readFileSync(
  join(process.cwd(), "src-tauri", "windows", "installer.nsi"),
  "utf8",
);

/** The body of `<kind> <name>` in the installer template, up to its end. */
function nsisBlock(kind: "Function" | "Section", name: string): string {
  const start = installer.indexOf(`${kind} ${name}\n`);
  expect(start).toBeGreaterThan(-1);
  return installer.slice(start, installer.indexOf(`${kind}End`, start));
}

/** The text without its NSIS comment lines. */
const withoutComments = (text: string) => text.replace(/^\s*;.*\n/gm, "");

/** The text between `from` and the first `to` after it, both of which must be there. */
function between(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf(to, start + from.length);
  expect(end).toBeGreaterThan(start);
  return text.slice(start + from.length, end);
}

// The uninstall with administrator rights runs on Windows, in the installer job
// (windows/test-uninstall.ps1, with a script swapped into the install folder);
// these hold the installer's side, whose files the installer itself writes.
verifies("studio.installer-elevated", () => {
  it("reads whether it has administrator rights once, in the installer and the uninstaller", () => {
    for (const init of [".onInit", "un.onInit"]) {
      expect(nsisBlock("Function", init)).toMatch(
        /^Function \S+\n {2}System::Call 'shell32::IsUserAnAdmin\(\) i \.s'\n {2}Pop \$Elevated\n/,
      );
    }
  });

  it("starts the helper only while it holds the file, with the verb it is given", () => {
    const helper = between(installer, "Function ${un}ElevateSandboxHelper\n", "FunctionEnd");
    const held = helper.indexOf(
      'CreateFileW(w "$INSTDIR\\halonic-sandbox-elevate.exe", i 0x80000000, i 1,',
    );
    const started = helper.indexOf("shell32::ShellExecuteExW");
    expect(held).toBeGreaterThan(-1);
    expect(started).toBeGreaterThan(held);
    expect(helper.indexOf("CloseHandle(p r4)", started)).toBeGreaterThan(started);
    expect(helper).toContain('w "$INSTDIR\\halonic-sandbox-elevate.exe", w "$5"');
    expect(installer).toContain(
      '!insertmacro ElevateSandboxHelper ""\n!insertmacro ElevateSandboxHelper "un."\n',
    );
  });

  it("starts the helper in a signed release only when the handle it holds is signed by the publisher built in", () => {
    expect(installer).toContain(
      '!if "$%HALONIC_HELPER_SIGNED%" == "yes"\n  !define SANDBOXSIGNER "$%HALONIC_SANDBOX_SIGNER%"\n!endif\n',
    );
    const helper = between(installer, "Function ${un}ElevateSandboxHelper\n", "FunctionEnd");
    const check = between(helper, "!ifdef SANDBOXSIGNER\n", "!endif\n");
    expect(check).toContain("Push $4\n    Call ${un}HelperSigner\n    Pop $2\n");
    const refused = between(check, '${If} $2 S!= "${SANDBOXSIGNER}"\n', "${EndIf}");
    expect(refused).toContain("CloseHandle(p r4)");
    expect(refused).toContain(
      `StrCpy $SandboxReason "the sandbox helper isn't signed by \${SANDBOXSIGNER}"`,
    );
    expect(refused).toContain('StrCpy $3 "nostart"');
    // Started only when nothing refused it, after the check.
    const started = helper.indexOf('${If} $3 == ""\n');
    expect(started).toBeGreaterThan(helper.indexOf("Call ${un}HelperSigner"));
    expect(helper.indexOf("shell32::ShellExecuteExW")).toBeGreaterThan(started);

    const signer = between(installer, "Function ${un}HelperSigner\n", "FunctionEnd");
    // WINTRUST_FILE_INFO with the held handle, WINTRUST_DATA with no UI (2),
    // no revocation check (0), a file (1) and verify (1).
    expect(signer).toContain('*(i 16, w "$INSTDIR\\halonic-sandbox-elevate.exe", p r0, p 0) p .r1');
    expect(signer).toContain(
      "*(i 52, p 0, p 0, i 2, i 0, i 1, p r1, i 1, p 0, p 0, i 0x1000, i 0, p 0)",
    );
    expect(signer).toContain('g "{00AAC56B-CD44-11d0-8CC2-00C04FC295EE}"');
    expect(signer).toContain("crypt32::CertGetNameStringW(p r4, i 4,");
    // The state the verify left is closed (WTD_STATEACTION_CLOSE) whatever it found.
    expect(between(signer, "IntOp $4 $2 + 28\n", "System::Free")).toContain(
      "*$4(i 2)'\n  System::Call 'wintrust::WinVerifyTrust(p 0, p r3, p r2)",
    );
    expect(installer).toContain('!insertmacro HelperSigner ""\n!insertmacro HelperSigner "un."\n');

    // Both callers keep the reason the check gave.
    for (const caller of [
      nsisBlock("Section", "SandboxStep"),
      nsisBlock("Function", "un.RemoveThroughHelper"),
    ]) {
      const nostart = between(caller, '${ElseIf} $2 == "nostart"\n', "${ElseIf}");
      expect(nostart).toMatch(
        /\$\{If\} \$SandboxReason == ""\n\s+StrCpy \$SandboxReason "Windows couldn't start/,
      );
    }
  });

  it("skips the take-back with administrator rights", () => {
    const step = nsisBlock("Section", "SandboxStep");
    const skipped = between(
      step,
      "${IfThen} $Elevated <> 0 ${|} Goto take_back_done ${|}\n",
      "take_back_done:\n",
    );
    expect(skipped).toContain("--sandbox-take-back'");
  });

  it("sets the sandbox up through the helper and skips the check after it", () => {
    const step = nsisBlock("Section", "SandboxStep");
    expect(step).toContain('Push "setup"\n      Call ElevateSandboxHelper\n');
    const elevated = between(step, '${If} $2 == "0"\n      ${AndIf} $Elevated <> 0\n', "${ElseIf}");
    expect(elevated).toContain('StrCpy $2 "unchecked"');
    expect(withoutComments(elevated)).not.toContain("$INSTDIR");
    expect(step.indexOf("-CheckOnly")).toBeGreaterThan(step.indexOf('StrCpy $2 "unchecked"'));
    const outcome = between(step, '${ElseIf} $2 == "unchecked"\n', "${ElseIf}");
    expect(outcome).toContain('StrCpy $SandboxOutcome "unchecked"');
    expect(outcome).toContain('"○ Checking the agent sandbox, skipped"');
    const finish = between(installer, '${ElseIf} $SandboxOutcome == "unchecked"\n', "${ElseIf}");
    expect(finish).toContain(
      '"✓ The agent sandbox is set up. To check it, open Settings › Agent sandbox."',
    );
  });

  it("doesn't check the installed sandbox for the run-again page", () => {
    const check = nsisBlock("Function", "CheckInstalledSandbox");
    const guard = check.indexOf("${AndIf} $Elevated = 0\n");
    expect(guard).toBeGreaterThan(-1);
    expect(check.indexOf("--sandbox-check")).toBeGreaterThan(guard);
  });

  it("skips the clean-up and removes the sandbox through the helper alone", () => {
    const uninstall = nsisBlock("Section", "Uninstall");
    const guard = uninstall.indexOf(
      '${If} ${FileExists} "$INSTDIR\\halonic-agent-host.exe"\n      ${AndIf} $Elevated = 0\n',
    );
    expect(guard).toBeGreaterThan(-1);
    expect(uninstall.indexOf("--sandbox-cleanup")).toBeGreaterThan(guard);

    const remove = nsisBlock("Function", "un.RemoveSandbox");
    const elevated = between(remove, "${If} $Elevated <> 0\n", "${Else}\n");
    expect(elevated.trim()).toBe("Call un.RemoveThroughHelper\n    Pop $2");
    expect(remove.indexOf('-File "$INSTDIR\\sandbox-remove.ps1"')).toBeGreaterThan(
      remove.indexOf("${Else}\n"),
    );

    const helper = nsisBlock("Function", "un.RemoveThroughHelper");
    expect(withoutComments(helper)).not.toContain("$INSTDIR");
    expect(helper).toContain(`nsExec::Exec '"$SYSDIR\\net.exe" user srt-sandbox'`);
    expect(helper).toContain(`nsExec::Exec '"$SYSDIR\\net.exe" localgroup sandbox-runtime-users'`);
    expect(helper).toContain('Push "remove"\n  Call un.ElevateSandboxHelper\n');
    expect(between(helper, '${If} $2 == "0"\n', "${ElseIf}")).toContain('StrCpy $2 "3"');
  });
});
