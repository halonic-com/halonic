import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type AppLogoId, appGlyphs } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");
const read = (path: string) => readFileSync(join(shellFolder, path));
const text = (path: string) => readFileSync(join(shellFolder, path), "utf8");

const focusedApps = ["inbox", "messenger"] as const;

/** Where an icon is drawn from the kit's glyphs: Halonic's own tile (macOS and Linux) is Studio's. */
const iconSources: Record<string, AppLogoId> = {
  "icons/icon.svg": "studio",
};

/** The paths and discs a glyph is drawn from, as `icons/draw-app-icons.mjs` writes them. */
const glyphMarks = (app: AppLogoId) =>
  appGlyphs[app].map((shape) =>
    shape.kind === "dot" ? `cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"` : `d="${shape.d}"`,
  );

/** Each image in an .ico: its width and height, whether it is a PNG, and its bytes. */
function icoEntries(ico: Buffer) {
  const count = ico.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const entry = 6 + 16 * index;
    const offset = ico.readUInt32LE(entry + 12);
    const bytes = ico.subarray(offset, offset + ico.readUInt32LE(entry + 8));
    return {
      pixels: ico.readUInt8(entry) || 256,
      png: bytes.subarray(0, 4).toString("latin1") === "\x89PNG",
      bytes,
    };
  });
}

/** The width and height of each image in an .ico, and whether it is a PNG. */
const icoImages = (ico: Buffer) => icoEntries(ico).map(({ pixels, png }) => ({ pixels, png }));

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
    "%s holds every size the board's set is drawn at, from 16 to 256 px",
    (path) => {
      expect(icoImages(read(path))).toEqual(
        [16, 20, 24, 32, 40, 48, 64, 256].map((pixels) => ({ pixels, png: true })),
      );
    },
  );

  it("draws Windows' icons as the board's dark, all-blue set and keeps the tile for icon.png's source", () => {
    const drawings = focusedApps.map((app) => text(`icons/apps/${app}.svg`));
    for (const svg of drawings) {
      expect(svg).toContain('viewBox="0 0 256 256"');
      // Ink glass, and the line of light in Halonic blue.
      expect(svg).toContain('stop-color="#17285a"');
      expect(svg).toContain('stop-color="#2f6df3"');
      expect(svg).toContain('stop-color="#22d3ee"');
      // No tile, and none of the ring's cyan or the kit's glyphs from the set before.
      expect(svg).not.toContain(" rx=");
      expect(svg).not.toContain("#1bc6c8");
      for (const app of Object.keys(appGlyphs) as AppLogoId[]) {
        for (const mark of glyphMarks(app).filter((m) => m.startsWith("d="))) {
          expect(svg).not.toContain(mark);
        }
      }
    }
    expect(new Set(drawings).size).toBe(focusedApps.length);
    expect(text("icons/icon.svg")).toContain('<rect width="100" height="100" rx="22"');
  });

  it("puts each hand-tuned image in its app's .ico in place of the drawn one", () => {
    const tunedFolder = join(shellFolder, "icons/tuned");
    const tuned = existsSync(tunedFolder) ? readdirSync(tunedFolder) : [];
    const missing = tuned.filter((file) => {
      const [, app, pixels] = /^(\w+)-(\d+)\.png$/.exec(file) ?? [];
      const path = app === "studio" ? "icons/icon.ico" : `icons/apps/${app}.ico`;
      const image = icoEntries(read(path)).find((entry) => entry.pixels === Number(pixels));
      return image?.bytes.equals(read(`icons/tuned/${file}`)) !== true;
    });
    expect(missing).toEqual([]);
  });

  it("gives each focused app's window its own 64 by 64 icon", () => {
    const shell = text("src/focused_apps.rs");
    for (const app of focusedApps) {
      expect(read(`icons/apps/${app}.rgba`)).toHaveLength(64 * 64 * 4);
      expect(shell).toContain(`include_bytes!("../icons/apps/${app}.rgba")`);
    }
    expect(read("icons/apps/inbox.rgba").equals(read("icons/apps/messenger.rgba"))).toBe(false);
    // Quick ask's window has no icon of its own, so `icon()` is optional.
    expect(text("src/window.rs")).toContain("if let Some(icon) = app.icon()");
    expect(text("src/window.rs")).toContain("window.set_icon(icon)");
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
