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

// The shortcuts themselves are made on Windows in the installer job; these
// keep them in the template, so a Tauri template merge can't drop them.
verifies("studio.installer-focused-apps", () => {
  const apps = [
    { title: "Inbox", app: "inbox" },
    { title: "Messenger", app: "messenger" },
  ];

  it("makes both shortcuts in the install section, on an update too", () => {
    const install = block("Section", "Install");
    const made = install.indexOf("Call CreateFocusedAppShortcuts");
    expect(made).toBeGreaterThan(install.indexOf("Call CreateOrUpdateStartMenuShortcut"));
    // Only a no-shortcut install skips them; an update doesn't.
    const create = block("Function", "CreateFocusedAppShortcuts");
    expect(create).toMatch(/\$\{If\} \$NoShortcutMode = 1\s+Return/);
    expect(create).not.toContain("$UpdateMode");
    for (const { title, app } of apps) {
      expect(create).toContain(
        `!insertmacro FocusedAppShortcut "\${PRODUCTNAME} ${title}" "${app}"`,
      );
    }
  });

  it("starts Halonic with --app and gives each shortcut the app's own ID", () => {
    const shortcut = installer.slice(installer.indexOf("!macro FocusedAppShortcut"));
    const body = shortcut.slice(0, shortcut.indexOf("!macroend"));
    expect(body).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
      'CreateShortcut "${FOCUSEDAPPFOLDER}\\${title}.lnk" "$INSTDIR\\${MAINBINARYNAME}.exe" "--app ${app}"',
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(body).toContain('"${BUNDLEID}.${app}"');
  });

  it("puts them beside Halonic's own shortcut", () => {
    expect(installer).toContain('!define FOCUSEDAPPFOLDER "$SMPROGRAMS\\$AppStartMenuFolder"');
  });

  it("removes both when Halonic is uninstalled, not when it is updated", () => {
    const uninstall = block("Section", "Uninstall");
    const removed = uninstall.indexOf("Call un.RemoveFocusedAppShortcuts");
    const notUpdating = uninstall.indexOf("; Remove shortcuts if not updating");
    expect(notUpdating).toBeGreaterThan(-1);
    expect(removed).toBeGreaterThan(notUpdating);
    // Before Halonic's folder goes, which only works on an empty folder.
    expect(removed).toBeLessThan(uninstall.indexOf('RMDir "$SMPROGRAMS\\$AppStartMenuFolder"'));
    const remove = block("Function", "un.RemoveFocusedAppShortcuts");
    for (const { title } of apps) {
      expect(remove).toContain(`!insertmacro RemoveFocusedAppShortcut "\${PRODUCTNAME} ${title}"`);
    }
  });
});
