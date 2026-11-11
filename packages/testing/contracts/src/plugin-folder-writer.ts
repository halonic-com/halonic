import type { FolderReader, PluginFolderWriter } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { FolderTree } from "./folder-reader.ts";

/** A writer over a plugins folder, and a reader over the same folder to see what it did. */
export interface PluginFolderUnderTest {
  readonly writer: PluginFolderWriter;
  readonly reader: FolderReader;
}

/** Creates a writer and a reader over a new plugins folder that holds `tree`. */
export type MakePluginFolderWriter = (tree: FolderTree) => Promise<PluginFolderUnderTest>;

/**
 * The contract every {@link PluginFolderWriter} adapter passes. What a
 * plugin's trust covers is what was placed, so `place` writes whole or not
 * at all, never takes an id that is already there, and nothing is written or
 * removed through a link.
 */
export function pluginFolderWriterContract(name: string, make: MakePluginFolderWriter): void {
  verifies("contracts.plugin-folder-writer", () => {
    describe(`PluginFolderWriter contract: ${name}`, () => {
      placeCases(make);
      takenCases(make);
      removeCases(make);
      unsafeCases(make);
    });
  });
}

const encoder = new TextEncoder();

/** Bytes that aren't valid UTF-8, so a writer that goes through text would change them. */
const notText = new Uint8Array([0xff, 0xfe, 0x00, 0x80]);

const weather = new Map<string, Uint8Array>([
  ["plugin.yaml", encoder.encode("id: weather\n")],
  ["backend/index.js", encoder.encode("export default {};\n")],
  ["backend/icon.bin", notText],
]);

/** Every path the reader lists, in its order. */
async function pathsOf(reader: FolderReader): Promise<string[]> {
  return (await reader.entries()).map((entry) => entry.path);
}

function placeCases(make: MakePluginFolderWriter): void {
  it("places every file as the folder named by the id, with its exact bytes", async () => {
    const { writer, reader } = await make({ files: { "notes/plugin.yaml": "id: notes\n" } });
    expect(await writer.place("weather", weather, { replace: false })).toBe("placed");
    expect(await pathsOf(reader)).toEqual([
      "notes",
      "notes/plugin.yaml",
      "weather",
      "weather/backend",
      "weather/backend/icon.bin",
      "weather/backend/index.js",
      "weather/plugin.yaml",
    ]);
    expect(await reader.read("weather/backend/icon.bin")).toEqual(notText);
  });

  it("puts the new folder in place of the same plugin's, leaving none of its old files", async () => {
    const { writer, reader } = await make({
      files: { "weather/plugin.yaml": "id: weather\n", "weather/old.js": "old" },
    });
    expect(await writer.place("weather", weather, { replace: true })).toBe("placed");
    expect(await reader.read("weather/old.js")).toBeNull();
    expect(await reader.read("weather/plugin.yaml")).toEqual(encoder.encode("id: weather\n"));
  });

  it("places with replace when nothing is there yet", async () => {
    const { writer, reader } = await make({});
    expect(await writer.place("weather", weather, { replace: true })).toBe("placed");
    expect(await reader.read("weather/plugin.yaml")).not.toBeNull();
  });

  it("names its location", async () => {
    const { writer } = await make({});
    expect(writer.location).not.toBe("");
  });
}

function takenCases(make: MakePluginFolderWriter): void {
  it("gives taken and writes nothing when the id is there and isn't replaced", async () => {
    const { writer, reader } = await make({ files: { "weather/plugin.yaml": "mine" } });
    expect(await writer.place("weather", weather, { replace: false })).toBe("taken");
    expect(await pathsOf(reader)).toEqual(["weather", "weather/plugin.yaml"]);
    expect(await reader.read("weather/plugin.yaml")).toEqual(encoder.encode("mine"));
  });

  it("gives taken for the id in another case, even when replacing", async () => {
    const { writer, reader } = await make({ files: { "Weather/plugin.yaml": "mine" } });
    expect(await writer.place("weather", weather, { replace: false })).toBe("taken");
    expect(await writer.place("weather", weather, { replace: true })).toBe("taken");
    // macOS ignores a zero-width non-joiner, so this opens as `Weather` too.
    expect(await writer.place("weat\u200Cher", weather, { replace: true })).toBe("taken");
    expect(await pathsOf(reader)).toEqual(["Weather", "Weather/plugin.yaml"]);
  });

  it("gives taken for a file or a link with the id, even when replacing, and leaves it alone", async () => {
    const { writer, reader } = await make({
      files: { "keep/data.txt": "kept", weather: "a file" },
      links: { notes: "keep" },
    });
    expect(await writer.place("weather", weather, { replace: true })).toBe("taken");
    expect(await writer.place("notes", weather, { replace: true })).toBe("taken");
    expect(await pathsOf(reader)).toEqual(["keep", "keep/data.txt", "notes", "weather"]);
    expect(await reader.read("weather")).toEqual(encoder.encode("a file"));
  });
}

function removeCases(make: MakePluginFolderWriter): void {
  it("removes a plugin folder with everything in it, and nothing else", async () => {
    const { writer, reader } = await make({
      files: { "weather/plugin.yaml": "", "weather/backend/index.js": "", "notes/plugin.yaml": "" },
    });
    await writer.remove("weather");
    expect(await pathsOf(reader)).toEqual(["notes", "notes/plugin.yaml"]);
  });

  it("removes a link itself, never what it points to", async () => {
    const { writer, reader } = await make({
      files: { "keep/data.txt": "kept" },
      links: { weather: "keep" },
    });
    await writer.remove("weather");
    expect(await pathsOf(reader)).toEqual(["keep", "keep/data.txt"]);
    expect(await reader.read("keep/data.txt")).toEqual(encoder.encode("kept"));
  });

  it("removes only the entry with exactly the id, never one in another case", async () => {
    const { writer, reader } = await make({ files: { "Weather/plugin.yaml": "mine" } });
    await writer.remove("weather");
    expect(await pathsOf(reader)).toEqual(["Weather", "Weather/plugin.yaml"]);
  });

  it("does nothing when there is no entry with the id", async () => {
    const { writer, reader } = await make({ files: { "notes/plugin.yaml": "" } });
    await writer.remove("weather");
    expect(await pathsOf(reader)).toEqual(["notes", "notes/plugin.yaml"]);
  });
}

function unsafeCases(make: MakePluginFolderWriter): void {
  const unsafeIds = [
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
    "nul.txt",
    "com1",
  ];

  it.each(unsafeIds)(
    "refuses the unsafe id %j with a RangeError and writes nothing",
    async (id) => {
      const { writer, reader } = await make({});
      await expect(writer.place(id, weather, { replace: false })).rejects.toThrow(RangeError);
      await expect(writer.remove(id)).rejects.toThrow(RangeError);
      expect(await pathsOf(reader)).toEqual([]);
    },
  );

  it.each([
    "../escape.js",
    "/etc/escape.js",
    "a//b.js",
    "./a.js",
    "a\\b.js",
    "a/../../b.js",
    "a.js:x",
    "backend./x.js",
    "con.js",
  ])("refuses the unsafe file path %j with a RangeError and writes nothing", async (path) => {
    const { writer, reader } = await make({});
    const files = new Map([...weather, [path, encoder.encode("x")]]);
    await expect(writer.place("weather", files, { replace: false })).rejects.toThrow(RangeError);
    expect(await pathsOf(reader)).toEqual([]);
  });

  it("refuses a path that is a file and a folder above another file, and writes nothing", async () => {
    const { writer, reader } = await make({});
    const files = new Map([...weather, ["backend/index.js/x", encoder.encode("x")]]);
    await expect(writer.place("weather", files, { replace: false })).rejects.toThrow(RangeError);
    expect(await pathsOf(reader)).toEqual([]);
  });

  it.each([
    ["Plugin.yaml", "a second plugin.yaml in another case"],
    ["Backend", "a file that is the backend folder in another case"],
  ])("refuses %j, %s, and writes nothing", async (path) => {
    const { writer, reader } = await make({});
    const files = new Map([...weather, [path, encoder.encode("x")]]);
    await expect(writer.place("weather", files, { replace: false })).rejects.toThrow(RangeError);
    expect(await pathsOf(reader)).toEqual([]);
  });
}
