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

  /** The body of `!macro <name>` in the installer template. */
  function macro(name: string): string {
    const start = installer.indexOf(`!macro ${name} `);
    expect(start).toBeGreaterThan(-1);
    return installer.slice(start, installer.indexOf("!macroend", start));
  }

  it("starts the app's frame with no arguments and gives each shortcut the app's own ID", () => {
    const body = macro("FocusedAppShortcut");
    expect(body).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
      'CreateShortcut "${FOCUSEDAPPFOLDER}\\${title}.lnk" "$INSTDIR\\${title}.exe" ""',
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(body).toContain('"${BUNDLEID}.${app}"');
  });

  it("makes the frames next to Halonic.exe as hard links to it, or copies, on every install", () => {
    const make = macro("MakeAppFrame");
    // A frame left by the version before goes first, so the link is to this Halonic.exe.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(make.indexOf('Delete "$INSTDIR\\${title}.exe"')).toBeGreaterThan(-1);
    expect(make).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
      'kernel32::CreateHardLinkW(w "$INSTDIR\\${title}.exe", w "$INSTDIR\\${MAINBINARYNAME}.exe", p 0)',
    );
    expect(make).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
      'CopyFiles /SILENT "$INSTDIR\\${MAINBINARYNAME}.exe" "$INSTDIR\\${title}.exe"',
    );
    const frames = block("Function", "MakeAppFrames");
    for (const { title } of apps) {
      expect(frames).toContain(`!insertmacro MakeAppFrame "\${PRODUCTNAME} ${title}"`);
    }
    const install = block("Section", "Install");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    const copied = install.indexOf('File "${MAINBINARYSRCPATH}"');
    expect(copied).toBeGreaterThan(-1);
    expect(install.indexOf("Call MakeAppFrames")).toBeGreaterThan(copied);
  });

  it("removes the frames when Halonic is uninstalled", () => {
    const uninstall = block("Section", "Uninstall");
    for (const { title } of apps) {
      expect(uninstall).toContain(`Delete "$INSTDIR\\\${PRODUCTNAME} ${title}.exe"`);
    }
  });

  it("waits for a frame still closing before it replaces or removes its exe", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    const wait = installer.slice(installer.indexOf("Function ${un}WaitUntilHelpersAreClosed"));
    for (const { title } of apps) {
      expect(wait.slice(0, wait.indexOf("FunctionEnd"))).toContain(
        `"$INSTDIR\\\${PRODUCTNAME} ${title}.exe"`,
      );
    }
    expect(installer).toContain('!insertmacro WaitUntilHelpersAreClosed "un."');
    expect(block("Section", "Uninstall")).toContain("Call un.WaitUntilHelpersAreClosed");
    const open = block("Function", "IsHalonicOpen");
    for (const { title } of apps) {
      expect(open).toContain(
        `RestartManager_RegisterFile $R0 "$INSTDIR\\\${PRODUCTNAME} ${title}.exe"`,
      );
    }
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
    // Whether the shortcut starts the frame or, as before the frames, Halonic.exe.
    const removeOne = macro("RemoveFocusedAppShortcut");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(removeOne).toContain('"$INSTDIR\\${title}.exe"');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
    expect(removeOne).toContain('"$INSTDIR\\${MAINBINARYNAME}.exe"');
  });

  it("removes the frames' places when Halonic is uninstalled, not when it is updated", () => {
    const uninstall = block("Section", "Uninstall");
    const removed = uninstall.indexOf('DeleteRegKey HKCU "Software\\Halonic\\Frames"');
    expect(removed).toBeGreaterThan(uninstall.indexOf("; Remove shortcuts if not updating"));
  });
});
