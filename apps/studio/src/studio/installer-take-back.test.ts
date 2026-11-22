import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");
const read = (path: string) => readFileSync(join(shellFolder, path), "utf8");

/** The body of `Section <name>` in the installer template. */
function nsisSection(name: string): string {
  const text = read("windows/installer.nsi");
  const start = text.indexOf(`Section ${name}\n`);
  expect(start).toBeGreaterThan(-1);
  return text.slice(start, text.indexOf("SectionEnd", start));
}

// The take-back itself runs on Windows as a standard user, in the installer job
// (windows/test-take-back.ps1); these hold its place in the installer.
verifies("studio.installer-take-back", () => {
  const step = nsisSection("SandboxStep");
  const takeBack = step.indexOf(
    `"$INSTDIR\\halonic-agent-host.exe" --profile-folder "$1" --sandbox-take-back'`,
  );

  it("runs the installed host's --sandbox-take-back in the sandbox step", () => {
    expect(takeBack).toBeGreaterThan(-1);
  });

  it("runs it before the box is read and the helper starts, so whatever the box says", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    const boxRead = step.indexOf("${If} $SandboxState == ${BST_CHECKED}");
    expect(boxRead).toBeGreaterThan(takeBack);
    expect(step.indexOf("Call ElevateSandboxHelper")).toBeGreaterThan(boxRead);
    expect(step.slice(0, takeBack)).not.toMatch(/\$\{If\}/);
  });

  it("goes on whatever it exits with", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    const after = step.slice(takeBack, step.indexOf("${If} $SandboxState"));
    expect(after).not.toMatch(/Abort|Quit|\$\{If\}/);
  });
});
