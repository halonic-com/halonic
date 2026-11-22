import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { readPluginFolder } from "./plugin-folder.ts";
import { PluginSourceSnapshot, sourceFolder } from "./plugin-source.ts";
import { pluginFileChanges, pluginSourceFileChanges } from "./plugin-source-changes.ts";
import { weatherManifest } from "./testing/plugin-fixtures.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** The weather plugin's source folder. */
function source(): TestFolderReader {
  return new TestFolderReader().putFiles({
    "plugin.yaml": weatherManifest,
    "backend/index.js": "export default {};\n",
  });
}

/** The file hashes a copy of `reader` has now, as its install record keeps them. */
async function copyOf(reader: TestFolderReader) {
  const read = await readPluginFolder(new PluginSourceSnapshot(reader), digest, sourceFolder, {
    namedById: false,
  });
  if (!read.ok) throw new Error("the weather source can't be read");
  return read.value.files;
}

verifies("app.plugin-source-changes", () => {
  it("names the files added, changed and removed between two copies", () => {
    const before = [
      { path: "backend/index.js", sha256: "aa" },
      { path: "backend/old.js", sha256: "bb" },
      { path: "plugin.yaml", sha256: "cc" },
    ];
    const after = [
      { path: "backend/extra.js", sha256: "dd" },
      { path: "backend/index.js", sha256: "ee" },
      { path: "plugin.yaml", sha256: "cc" },
    ];

    expect(pluginFileChanges(before, after)).toEqual({
      added: ["backend/extra.js"],
      changed: ["backend/index.js"],
      removed: ["backend/old.js"],
    });
  });

  it("gives what changed in the source folder since the copy", async () => {
    const reader = source();
    const copied = await copyOf(reader);
    reader.putFiles({
      "backend/index.js": "export default { edited: true };\n",
      "backend/extra.js": "export const extra = 1;\n",
    });

    const changes = await pluginSourceFileChanges(reader, digest, copied);

    expect(changes).toEqual({
      ok: true,
      value: { added: ["backend/extra.js"], changed: ["backend/index.js"], removed: [] },
    });
  });

  it("doesn't count private files the copy leaves out as a change", async () => {
    const reader = source();
    const copied = await copyOf(reader);
    reader.putFiles({ ".env": "KEY=1\n", ".ssh/id_ed25519": "private\n" });

    const changes = await pluginSourceFileChanges(reader, digest, copied);

    expect(changes).toEqual({ ok: true, value: { added: [], changed: [], removed: [] } });
  });

  it("gives the problems of a source that is no longer a plugin", async () => {
    const reader = source();
    const copied = await copyOf(reader);
    reader.putFiles({ "plugin.yaml": "id: weather\n" });

    const changes = await pluginSourceFileChanges(reader, digest, copied);

    expect(changes.ok).toBe(false);
    if (!changes.ok) expect(changes.error.length).toBeGreaterThan(0);
  });
});
