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

/** The body of `Function <name>` in the installer template. */
function nsisFunction(name: string): string {
  const start = installer.indexOf(`Function ${name}\n`);
  expect(start).toBeGreaterThan(-1);
  return installer.slice(start, installer.indexOf("FunctionEnd", start));
}

// The Windows update job's runner has no limited token (its programs all run
// with administrator rights), so its go-back test still goes back; these hold
// the installer's side.
verifies("studio.installer-rollback-elevated", () => {
  it("asks about its rights after the wait, before the guard and the kept installer", () => {
    const wait = nsisFunction("WaitForStartOrGoBack");
    const loopEnd = wait.indexOf("${LoopUntil} $3 >= 180");
    const asked = wait.indexOf("Call RaisedFromLimitedRights\n  Pop $4\n");
    expect(asked).toBeGreaterThan(loopEnd);
    expect(wait.indexOf("Call CheckSetupVersion")).toBeGreaterThan(asked);
    expect(wait.indexOf("/ROLLBACK")).toBeGreaterThan(asked);

    const raised = wait.slice(asked, wait.indexOf("${EndIf}\n  ; Halonic change (HAL-5404 S3)"));
    expect(raised).toContain("${If} $4 = 1\n");
    expect(raised).toMatch(
      /didn't go back to \$OldVersion, because this update runs with administrator rights/,
    );
    expect(raised).toMatch(/Call LogUpdateLine\n\s+!endif\n\s+Return\n/);
    expect(raised).not.toContain("Exec");
  });

  it("counts only a full elevation as raised, and any administrator when it can't tell", () => {
    const rights = nsisFunction("RaisedFromLimitedRights");
    expect(rights).toContain("advapi32::OpenProcessToken(p -1, i 8, *p .r0) i .r1");
    expect(rights).toContain(
      "advapi32::GetTokenInformation(p r0, i 18, *i .r2, i 4, *i .r3) i .r1",
    );
    expect(rights).toContain("kernel32::CloseHandle(p r0)");
    const fallback = rights.slice(rights.indexOf('${If} $2 == ""\n'));
    expect(fallback).toMatch(/IsUserAnAdmin\(\) i \.r2'\n\s+\$\{If\} \$2 <> 0\n\s+StrCpy \$2 2\n/);
    expect(rights).toMatch(/\$\{If\} \$2 = 2\n\s+StrCpy \$2 1\n\s+\$\{Else\}\n\s+StrCpy \$2 0\n/);
  });
});
