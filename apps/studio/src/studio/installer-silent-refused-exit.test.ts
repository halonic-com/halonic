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

/** The text between `from` and the first `to` after it, both of which must be there. */
function between(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf(to, start + from.length);
  expect(end).toBeGreaterThan(start);
  return text.slice(start + from.length, end);
}

const setsTheExitCode =
  "!ifdef SANDBOXSIGNER\n" +
  "${If} ${Silent}\n" +
  "${AndIf} $HelperRefused == 1\n" +
  "SetErrorLevel ${HELPER_REFUSED_EXIT}\n" +
  "${EndIf}\n" +
  "!endif\n";

/** The text without its NSIS comment lines and indentation. */
const flattened = (text: string) => text.replace(/^\s*;.*\n/gm, "").replace(/^\s+/gm, "");

// The silent install and uninstall run on Windows, in the installer job
// (windows/test-unsigned-helper.ps1, with an installer packed with a publisher
// and the helper unsigned); these hold the template's side.
verifies("studio.installer-silent-refused-exit", () => {
  it("gives a signed release's refusal 41, after the helper's own codes", () => {
    expect(installer).toContain(
      "!ifdef SANDBOXSIGNER\n  Var HelperRefused\n  !define HELPER_REFUSED_EXIT 41\n!endif\n",
    );
  });

  it("records the refusal only where the helper isn't signed by the publisher", () => {
    const helper = between(installer, "Function ${un}ElevateSandboxHelper\n", "FunctionEnd");
    const refused = between(helper, '${If} $2 S!= "${SANDBOXSIGNER}"\n', "${EndIf}");
    expect(refused).toContain("StrCpy $HelperRefused 1\n");
    expect(helper.split("$HelperRefused")).toHaveLength(2);
  });

  it("sets the exit code after the silent install's sandbox step and the silent removal", () => {
    const step = between(installer, "Section SandboxStep\n", "SectionEnd");
    expect(flattened(step)).toContain(setsTheExitCode);
    const remove = between(installer, "Function un.RemoveSandbox\n", "FunctionEnd");
    expect(flattened(remove)).toMatch(new RegExp(`${escaped(setsTheExitCode)}$`));
    // Nothing else sets it, so a passive update or a build without a
    // publisher keeps its code.
    expect(installer.split("SetErrorLevel ${HELPER_REFUSED_EXIT}")).toHaveLength(3);
  });
});

/** `text` as a regular expression that matches it literally. */
function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
