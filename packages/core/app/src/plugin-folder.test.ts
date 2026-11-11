import type { Digest } from "@halonicjs/ports";
import { bytesToHex } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MAX_PLUGIN_BYTES, MAX_PLUGIN_ENTRIES, readPluginFolder } from "./plugin-folder.ts";
import { weatherManifest } from "./testing/plugin-fixtures.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** Bytes that aren't valid UTF-8, so only the bytes tell them apart. */
const notText = new Uint8Array([0xff, 0xfe, 0x00, 0x80]);

const integrationSheet = `id: radar
version: 0.3.0
kit: 1
provides: [connector]
hosts: [radar.example.com]
tools:
  - { name: radar-map, description: The rain radar., risk: read, untrusted: true }
`;

function weatherFolder(): TestFolderReader {
  return new TestFolderReader().putFiles({
    "weather/plugin.yaml": weatherManifest,
    "weather/backend/index.js": "export default {};\n",
    "weather/assets/icon.bin": notText,
  });
}

async function problemsOf(reader: TestFolderReader, folder = "weather") {
  const read = await readPluginFolder(reader, digest, folder);
  if (read.ok) throw new Error("expected problems, but the plugin read");
  return read.error;
}

verifies("app.plugin-folder", () => {
  it("reads the plugin, its location and the hash of every file's bytes, sorted", async () => {
    const read = await readPluginFolder(weatherFolder(), digest, "weather");
    if (!read.ok) throw new Error(JSON.stringify(read.error));
    expect(read.value.plugin.id).toBe("weather");
    expect(read.value.location).toBe("/profile/plugins/weather");
    expect(read.value.files.map((file) => file.path)).toEqual([
      "assets/icon.bin",
      "backend/index.js",
      "plugin.yaml",
    ]);
    expect(read.value.files[0]?.sha256).toBe(bytesToHex(await digest.sha256(notText)));
  });

  it("parses the manifest from the bytes it hashed, never a second read", async () => {
    const reader = weatherFolder();
    const reads: string[] = [];
    reader.beforeRead = (path) => reads.push(path);
    const read = await readPluginFolder(reader, digest, "weather");
    expect(read.ok).toBe(true);
    expect(reads.filter((path) => path === "weather/plugin.yaml")).toHaveLength(1);
  });

  it("reads an integration.yaml as a plugin with only a backend", async () => {
    const reader = new TestFolderReader().putFiles({
      "radar/integration.yaml": integrationSheet,
      "radar/backend/index.js": "",
    });
    const read = await readPluginFolder(reader, digest, "radar");
    if (!read.ok) throw new Error(JSON.stringify(read.error));
    expect(read.value.plugin.name).toBe("radar");
    expect(read.value.plugin.backend?.tools.map((tool) => tool.name)).toEqual(["radar-map"]);
  });

  it("needs exactly one of plugin.yaml and integration.yaml", async () => {
    const none = new TestFolderReader().putFiles({ "weather/backend/index.js": "" });
    expect((await problemsOf(none)).map((problem) => problem.code)).toEqual(["manifest-missing"]);
    const both = weatherFolder().putFiles({ "weather/integration.yaml": integrationSheet });
    expect((await problemsOf(both)).map((problem) => problem.code)).toEqual(["manifest-twice"]);
  });

  it("gives the manifest's own problems with their line", async () => {
    const reader = weatherFolder().putFiles({
      "weather/plugin.yaml": "id: weather\nversion: one\n",
    });
    const problems = await problemsOf(reader);
    expect(problems.length).toBeGreaterThan(0);
    expect(
      problems.every((problem) => problem.file === "plugin.yaml" && problem.line !== undefined),
    ).toBe(true);
  });

  it("needs the folder named exactly as the plugin's id", async () => {
    const reader = new TestFolderReader().putFiles({
      "weather-old/plugin.yaml": weatherManifest,
      "weather-old/backend/index.js": "",
    });
    expect(await problemsOf(reader, "weather-old")).toEqual([
      expect.objectContaining({ code: "folder-name", file: "plugin.yaml", path: ["id"] }),
    ]);
  });

  it("refuses another SDK version and a backend with tokens, with the ADR's sentence", async () => {
    const manifest = weatherManifest
      .replace("sdk: 1", "sdk: 2")
      .replace("backend:\n", "backend:\n  tokens: [{ name: refresh, purpose: Stays signed in }]\n");
    const problems = await problemsOf(
      weatherFolder().putFiles({ "weather/plugin.yaml": manifest }),
    );
    expect(problems.map((problem) => [problem.code, problem.path])).toEqual([
      ["sdk-version", ["sdk"]],
      ["backend-tokens", ["backend", "tokens"]],
    ]);
    expect(problems[1]?.message).toBe(
      "An integration you build or change can't hold sign-in secrets yet. Use an API key, or ask for sign-in support.",
    );
  });

  it("points a check's problem at the integration.yaml's own keys", async () => {
    const sheet = integrationSheet
      .replace("kit: 1", "kit: 2")
      .replace("tools:", "tokens: [{ name: refresh, purpose: Stays signed in }]\ntools:");
    const reader = new TestFolderReader().putFiles({ "radar/integration.yaml": sheet });
    const problems = await problemsOf(reader, "radar");
    expect(problems.map((problem) => [problem.file, problem.code, problem.path])).toEqual([
      ["integration.yaml", "sdk-version", ["kit"]],
      ["integration.yaml", "backend-tokens", ["tokens"]],
      ["integration.yaml", "file-missing", []],
    ]);
  });

  it("needs the backend's entry and every script to be files in the folder", async () => {
    const manifest = weatherManifest.replace(
      'package: { runner: npx, name: "@acme/files-mcp", version: 3.1.4 }',
      "script: { program: node, path: tools/files.js }",
    );
    const reader = new TestFolderReader().putFiles({ "weather/plugin.yaml": manifest });
    expect((await problemsOf(reader)).map((problem) => problem.path)).toEqual([
      ["backend", "entry"],
      ["localTools", 0, "start", "script", "path"],
    ]);
  });

  it("refuses a link or special file anywhere before reading any bytes", async () => {
    const reader = weatherFolder().putLink("weather/assets/latest").putSpecial("weather/pipe");
    reader.beforeRead = () => {
      throw new Error("read a byte");
    };
    expect((await problemsOf(reader)).map((problem) => [problem.code, problem.file])).toEqual([
      ["link", "assets/latest"],
      ["special-file", "pipe"],
    ]);
  });

  it("stops past the limits before reading any bytes, and says a .git folder counts", async () => {
    const many: Record<string, string> = {};
    for (let index = 0; index < MAX_PLUGIN_ENTRIES; index++)
      many[`weather/.git/objects/${index}`] = "";
    const crowded = weatherFolder().putFiles(many);
    const large = weatherFolder().putFiles({ "weather/big.bin": new Uint8Array(MAX_PLUGIN_BYTES) });
    for (const reader of [crowded, large]) {
      reader.beforeRead = () => {
        throw new Error("read a byte");
      };
      const [problem] = await problemsOf(reader);
      expect(problem?.message).toMatch(/2,000 files and folders|50 MB/u);
      expect(problem?.message).toContain("A .git folder inside it counts too");
    }
  });

  it("runs the manifest's checks before it reads any other file", async () => {
    const reader = new TestFolderReader().putFiles({
      "weather-old/plugin.yaml": weatherManifest,
      "weather-old/backend/index.js": "",
    });
    const reads: string[] = [];
    reader.beforeRead = (path) => reads.push(path);
    await problemsOf(reader, "weather-old");
    expect(reads).toEqual(["weather-old/plugin.yaml"]);
  });

  it("counts the bytes it reads, and stops once a file grew past the limit", async () => {
    const reader = weatherFolder();
    const reads: string[] = [];
    reader.beforeRead = (path) => {
      reads.push(path);
      if (path === "weather/assets/icon.bin")
        reader.putFiles({ [path]: new Uint8Array(MAX_PLUGIN_BYTES) });
    };
    expect(await problemsOf(reader)).toEqual([expect.objectContaining({ code: "too-large" })]);
    expect(reads).not.toContain("weather/backend/index.js");
  });

  it("says when a file was removed while it was read", async () => {
    const reader = weatherFolder();
    reader.beforeRead = (path) => {
      if (path === "weather/assets/icon.bin") reader.remove(path);
    };
    expect(await problemsOf(reader)).toEqual([
      expect.objectContaining({ code: "changed-while-read", file: "assets/icon.bin" }),
    ]);
  });
});
