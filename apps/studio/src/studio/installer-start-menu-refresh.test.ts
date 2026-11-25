import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");
const installer = readFileSync(join(shellFolder, "windows/installer.nsi"), "utf8");

/** The body of `Section <name>` or `Function <name>` in the installer template. */
function block(kind: "Section" | "Function", name: string): string {
  const start = installer.indexOf(`${kind} ${name}\n`);
  expect(start).toBeGreaterThan(-1);
  return installer.slice(start, installer.indexOf(`${kind}End`, start));
}

// The shortcuts themselves are checked on Windows in the installer jobs
// (windows/start-menu.ps1); these keep the template's order and conditions.
verifies("studio.installer-start-menu-refresh", () => {
  it("removes the old shortcuts, then makes the current set, after the copy step", () => {
    const install = block("Section", "Install");
    const copyDone = install.indexOf("copy_done:");
    const removed = install.indexOf("Call RemoveOldStartMenuShortcuts");
    const halonic = install.indexOf("Call CreateOrUpdateStartMenuShortcut");
    const focused = install.indexOf("Call CreateFocusedAppShortcuts");
    // After the label run again without Repair jumps to, so it remakes them too.
    expect(copyDone).toBeGreaterThan(-1);
    expect(removed).toBeGreaterThan(copyDone);
    expect(halonic).toBeGreaterThan(removed);
    expect(focused).toBeGreaterThan(halonic);
  });

  it("removes every shortcut in Halonic's folder and Halonic's old one at the top", () => {
    const remove = block("Function", "RemoveOldStartMenuShortcuts");
    expect(remove).toMatch(/\$\{If\} \$NoShortcutMode = 1\s+Return/);
    expect(remove).toContain('Delete "$SMPROGRAMS\\$AppStartMenuFolder\\*.lnk"');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(remove).toContain('Delete "$SMPROGRAMS\\${PRODUCTNAME}.lnk"');
  });

  it("makes Halonic's own shortcut on an update too, and skips it only for /NS", () => {
    const create = block("Function", "CreateOrUpdateStartMenuShortcut");
    expect(create).toMatch(/\$\{If\} \$NoShortcutMode = 1\s+Return/);
    expect(create).not.toContain("$UpdateMode");
    expect(create).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
      'CreateShortcut "$SMPROGRAMS\\$AppStartMenuFolder\\${PRODUCTNAME}.lnk"',
    );
  });
});
