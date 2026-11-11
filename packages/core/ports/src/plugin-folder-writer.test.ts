import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  checkPluginFiles,
  checkPluginId,
  type PlacePluginOptions,
  type PluginFolderWriter,
  type PluginPlacement,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

verifies("ports.plugin-folder-writer", () => {
  typeTest("only places and removes whole plugin folders", () => {
    expectTypeOf<keyof PluginFolderWriter>().toEqualTypeOf<"location" | "place" | "remove">();
    expectTypeOf<PluginFolderWriter["place"]>().parameters.toEqualTypeOf<
      [id: string, files: ReadonlyMap<string, Uint8Array>, options: PlacePluginOptions]
    >();
    expectTypeOf<PluginFolderWriter["place"]>().returns.toEqualTypeOf<Promise<PluginPlacement>>();
    expectTypeOf<PluginFolderWriter["remove"]>().parameters.toEqualTypeOf<[id: string]>();
    expectTypeOf<PluginPlacement>().toEqualTypeOf<"placed" | "taken">();
  });

  it("makes the caller say whether a plugin already there is replaced", () => {
    const replace: PlacePluginOptions = { replace: true };
    // @ts-expect-error: replacing a plugin is never a default
    const unsaid: PlacePluginOptions = {};
    expect([replace, unsaid]).toHaveLength(2);
  });

  it.each([
    "",
    ".",
    "..",
    "a/b",
    "a\\b",
    "a\u0000b",
    "a\u0007b",
    "weather:x",
    "weather.",
    "weather ",
    "weath~1",
    "con",
    "NUL",
    "aux.txt",
    "com1",
    "lpt9.yaml",
    "a?b",
  ])("refuses the id %j", (id) => {
    expect(() => checkPluginId(id)).toThrow(RangeError);
  });

  it.each(["Weather-2", "weather.v2", "console", "com10", "~weather"])(
    "takes the id %j, one folder name in any case",
    (id) => {
      expect(() => checkPluginId(id)).not.toThrow();
    },
  );

  it("refuses an unsafe file path, and a file that is also a folder above another", () => {
    const bytes = new Uint8Array();
    const placed = (paths: string[]) => () =>
      checkPluginFiles("weather", new Map(paths.map((path) => [path, bytes])));
    expect(placed(["plugin.yaml", "backend/index.js"])).not.toThrow();
    expect(placed(["plugin.yaml", "../escape.js"])).toThrow(RangeError);
    expect(placed(["backend", "backend/index.js"])).toThrow(
      '"backend" is a file and also a folder above "backend/index.js".',
    );
    expect(() => checkPluginFiles("..", new Map())).toThrow(RangeError);
  });

  it("refuses a file path segment Windows or macOS would open as another entry", () => {
    const bytes = new Uint8Array();
    for (const path of [
      "a.js:x",
      "backend./index.js",
      "backend /index.js",
      "con.js",
      "PROGRA~1/a",
    ]) {
      expect(() => checkPluginFiles("weather", new Map([[path, bytes]])), path).toThrow(RangeError);
    }
  });

  it("refuses two paths that are the same file on a disk that ignores case", () => {
    const bytes = new Uint8Array();
    const placed = (paths: string[]) => () =>
      checkPluginFiles("weather", new Map(paths.map((path) => [path, bytes])));
    expect(placed(["a.js", "A.js"])).toThrow(
      '"a.js" and "A.js" are the same file on a disk that ignores case.',
    );
    expect(placed(["backend/a.js", "Backend/b.js"])).not.toThrow();
    expect(placed(["Backend", "backend/index.js"])).toThrow(
      '"Backend" is a file and also a folder above "backend/index.js".',
    );
  });
});
