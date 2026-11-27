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

const apps = ["halonic", "inbox", "messenger"];

// The shortcuts' icons are checked on Windows in the installer jobs
// (windows/start-menu.ps1); these keep the template's order and conditions.
verifies("studio.installer-icon-refresh", () => {
  it("copies the icons and refreshes the shortcuts after every shortcut is made", () => {
    const install = block("Section", "Install");
    const copyDone = install.indexOf("copy_done:");
    const focused = install.indexOf("Call CreateFocusedAppShortcuts");
    const copied = install.indexOf("Call CopyVersionedIcons");
    const refreshed = install.indexOf("Call RefreshShortcutIcons");
    // After the label run again without Repair jumps to, so it refreshes them too.
    expect(focused).toBeGreaterThan(copyDone);
    expect(copied).toBeGreaterThan(focused);
    expect(refreshed).toBeGreaterThan(copied);
    expect(block("Function", "RefreshShortcutIcons")).not.toContain("$NoShortcutMode");
  });

  it("puts the version in each icon copy's name and removes the older copies", () => {
    expect(
      JSON.parse(readFileSync(join(shellFolder, "tauri.installer.conf.json"), "utf8")).bundle
        .resources["icons/icon.ico"],
    ).toBe("icons/halonic.ico");
    const macro = installer.slice(installer.indexOf("!macro CopyVersionedIcon"));
    const body = macro.slice(0, macro.indexOf("!macroend"));
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(body).toContain('Delete "$INSTDIR\\icons\\${app}-*.ico"');
    expect(body).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
      'CopyFiles /SILENT "$INSTDIR\\icons\\${app}.ico" "$INSTDIR\\icons\\${app}-${VERSION}.ico"',
    );
    const copy = block("Function", "CopyVersionedIcons");
    for (const app of apps) {
      expect(copy).toContain(`!insertmacro CopyVersionedIcon "${app}"`);
    }
  });

  it("points only shortcuts that start this Halonic at their app's copy", () => {
    const point = block("Function", "PointShortcutAtVersionedIcon");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(point).toContain('${If} $2 == "$INSTDIR\\${MAINBINARYNAME}.exe"');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(point).toContain('${If} $3 == "--app inbox"');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(point).toContain('${ElseIf} $3 == "--app messenger"');
    expect(point).toContain(
      `\${IShellLink::SetIconLocation} $0 '("$INSTDIR\\icons\\$4-\${VERSION}.ico", 0)'`,
    );
  });

  it("refreshes the Start menu folder, the desktop and the taskbar's pins, then tells Explorer", () => {
    const refresh = block("Function", "RefreshShortcutIcons");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(refresh).toContain('!insertmacro RefreshShortcutIconsIn "${FOCUSEDAPPFOLDER}"');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(refresh).toContain('StrCpy $R0 "$DESKTOP\\${PRODUCTNAME}.lnk"');
    expect(refresh).toContain(
      '!insertmacro RefreshShortcutIconsIn "$APPDATA\\Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar"',
    );
    // SHCNE_ASSOCCHANGED, SHCNF_IDLIST, last.
    expect(refresh.trimEnd()).toMatch(/shell32::SHChangeNotify\(i 0x08000000, i 0, p 0, p 0\)'$/);
  });

  it("never deletes the icon cache or stops Explorer", () => {
    expect(installer).not.toMatch(/iconcache/i);
    expect(installer).not.toMatch(/explorer\.exe/i);
  });

  it("removes the icon copies when Halonic is uninstalled", () => {
    const uninstall = block("Section", "Uninstall");
    for (const app of apps) {
      expect(uninstall).toContain(`Delete "$INSTDIR\\icons\\${app}-*.ico"`);
    }
  });
});
