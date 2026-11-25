import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type AppLogoId, appGlyphs } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");
const read = (path: string) => readFileSync(join(shellFolder, path));
const text = (path: string) => readFileSync(join(shellFolder, path), "utf8");

const focusedApps = ["inbox", "messenger"] as const;

/** Where each app's icon is drawn: Halonic's own icon is Studio's. */
const iconSources: Record<string, AppLogoId> = {
  "icons/icon.svg": "studio",
  "icons/apps/inbox.svg": "inbox",
  "icons/apps/messenger.svg": "messenger",
};

/** The paths and discs a glyph is drawn from, as `icons/draw-app-icons.mjs` writes them. */
const glyphMarks = (app: AppLogoId) =>
  appGlyphs[app].map((shape) =>
    shape.kind === "dot" ? `cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"` : `d="${shape.d}"`,
  );

/** The width and height of each image in an .ico, and whether it is a PNG. */
function icoImages(ico: Buffer) {
  const count = ico.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const entry = 6 + 16 * index;
    const offset = ico.readUInt32LE(entry + 12);
    return {
      pixels: ico.readUInt8(entry) || 256,
      png: ico.subarray(offset, offset + 4).toString("latin1") === "\x89PNG",
    };
  });
}

verifies("studio.app-icons", () => {
  describe("drawn from the kit's glyphs", () => {
    it.each(Object.entries(iconSources))("%s draws %s's glyph and no other", (path, app) => {
      const svg = text(path);
      for (const mark of glyphMarks(app)) {
        expect(svg).toContain(mark);
      }
      const others = (Object.keys(appGlyphs) as AppLogoId[]).filter((other) => other !== app);
      for (const other of others) {
        for (const mark of glyphMarks(other).filter((m) => !glyphMarks(app).includes(m))) {
          expect(svg).not.toContain(mark);
        }
      }
    });
  });

  it.each(["icons/icon.ico", ...focusedApps.map((app) => `icons/apps/${app}.ico`)])(
    "%s holds every size from 16 to 256 px",
    (path) => {
      expect(icoImages(read(path))).toEqual(
        [16, 24, 32, 48, 64, 256].map((pixels) => ({ pixels, png: true })),
      );
    },
  );

  it("gives each focused app's window its own 64 by 64 icon", () => {
    const shell = text("src/focused_apps.rs");
    for (const app of focusedApps) {
      expect(read(`icons/apps/${app}.rgba`)).toHaveLength(64 * 64 * 4);
      expect(shell).toContain(`include_bytes!("../icons/apps/${app}.rgba")`);
    }
    expect(read("icons/apps/inbox.rgba").equals(read("icons/apps/messenger.rgba"))).toBe(false);
    expect(text("src/window.rs")).toContain("window.set_icon(app.icon())");
  });

  it("installs each focused app's icon and gives its shortcut that icon", () => {
    const resources = JSON.parse(text("tauri.installer.conf.json")).bundle.resources;
    for (const app of focusedApps) {
      expect(resources[`icons/apps/${app}.ico`]).toBe(`icons/${app}.ico`);
    }
    const installer = text("windows/installer.nsi");
    const macro = installer.slice(installer.indexOf("!macro FocusedAppShortcut"));
    expect(macro.slice(0, macro.indexOf("!macroend"))).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: NSIS defines, written literally
      '"--app ${app}" "$INSTDIR\\icons\\${app}.ico" 0',
    );
  });

  it("keeps Halonic's own icon, the exe's and the installer's, Studio's", () => {
    expect(JSON.parse(text("tauri.conf.json")).bundle.icon).toEqual([
      "icons/icon.png",
      "icons/icon.ico",
    ]);
  });
});
