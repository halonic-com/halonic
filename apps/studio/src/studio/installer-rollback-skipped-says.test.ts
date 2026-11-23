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

// Windows can't run here and the update job's runner never skips going back,
// so these hold the installer's side.
verifies("studio.installer-rollback-skipped-says", () => {
  it("shows the reason when a raised update skips going back", () => {
    const wait = nsisFunction("WaitForStartOrGoBack");
    const raised = wait.slice(
      wait.indexOf("${If} $4 = 1\n"),
      wait.indexOf("${EndIf}\n  ; Halonic change (HAL-5404 S3)"),
    );
    expect(raised).toMatch(
      /StrCpy \$R3 "[^"]*didn't start within 3 minutes[^"]*"\n\s+Call SayRollbackSkipped\n[\s\S]*Return\n/,
    );
  });

  it("shows the reason when the rollback guard refuses", () => {
    const wait = nsisFunction("WaitForStartOrGoBack");
    const refused = wait.slice(wait.indexOf("${If} $R1 <> 0\n"), wait.indexOf("/ROLLBACK"));
    expect(refused).toMatch(
      /StrCpy \$R3 "[^"]*is refused because \$R2[^"]*"\n\s+Call SayRollbackSkipped\n\s+Call LogUpdateLine\n\s+Return\n/,
    );
  });

  it("names updates.log in the message, and shows nothing when silent", () => {
    const say = nsisFunction("SayRollbackSkipped");
    expect(say).toMatch(/^Function SayRollbackSkipped\n\s+\$\{If\} \$\{Silent\}\n\s+Return\n/);
    expect(say).toContain("Call ProfileFolder");
    expect(say).toContain(
      'MessageBox MB_OK|MB_ICONEXCLAMATION|MB_TOPMOST "$R3$\\r$\\n$\\r$\\nThis is also written to $0\\updates\\updates.log."',
    );
  });
});
