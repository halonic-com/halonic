import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type AppLogoId, appGlyphs } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const res = join(process.cwd(), "src-tauri", "gen", "android", "app", "src", "main", "res");
const text = (path: string) => readFileSync(join(res, path), "utf8");

const shortcutApps = ["inbox", "messenger"] as const;

/** The paths a glyph is drawn from, as `icons/draw-app-icons.mjs` writes them for Android. */
const glyphPaths = (app: AppLogoId) =>
  appGlyphs[app].flatMap((shape) =>
    shape.kind === "dot" ? [] : [`android:pathData="${shape.d}"`],
  );

verifies("studio.src-tauri.app-shortcuts-commands", () => {
  describe("the shortcuts' icons", () => {
    it.each(shortcutApps)("draw %s's approved glyph and no other's", (app) => {
      const foreground = text(`drawable/ic_shortcut_${app}_foreground.xml`);
      for (const path of glyphPaths(app)) {
        expect(foreground).toContain(path);
      }
      const other = app === "inbox" ? "messenger" : "inbox";
      for (const path of glyphPaths(other)) {
        expect(foreground).not.toContain(path);
      }
    });

    it.each(shortcutApps)("make %s an adaptive icon over the slate tile", (app) => {
      const adaptive = text(`drawable-anydpi-v26/ic_shortcut_${app}.xml`);
      expect(adaptive).toContain(
        '<background android:drawable="@drawable/ic_shortcut_background" />',
      );
      expect(adaptive).toContain(
        `<foreground android:drawable="@drawable/ic_shortcut_${app}_foreground" />`,
      );
      expect(text("drawable/ic_shortcut_background.xml")).toContain('android:fillColor="#020617"');
    });
  });

  it("lists Inbox first, then Messenger, each opening only its screen's name", () => {
    const shortcuts = text("xml/shortcuts.xml");
    const ids = [...shortcuts.matchAll(/android:shortcutId="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(["inbox", "messenger"]);
    for (const app of shortcutApps) {
      expect(shortcuts).toContain(`android:data="halonic-shortcut://open/${app}"`);
      expect(shortcuts).toContain(`android:icon="@drawable/ic_shortcut_${app}"`);
    }
    expect(text("values/strings.xml")).toContain('<string name="shortcut_inbox">"Inbox"</string>');
    expect(text("values/strings.xml")).toContain(
      '<string name="shortcut_messenger">"Messenger"</string>',
    );
  });
});
