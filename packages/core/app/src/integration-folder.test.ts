import type { Digest } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { integrationCodeDigest } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import {
  MAX_INTEGRATION_BYTES,
  MAX_INTEGRATION_ENTRIES,
  readIntegrationFolder,
} from "./integration-folder.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const folder = "integrations/radar";

const radarSheet = `id: radar
version: 0.3.0
kit: 1
provides: [connector]
hosts: [radar.example.com]
tools:
  - { name: radar-map, description: The rain radar., risk: read, untrusted: true }
`;

const indexJs = "export default {};\n";

function radarFolder(): TestFolderReader {
  return new TestFolderReader().putFiles({
    [`${folder}/integration.yaml`]: radarSheet,
    [`${folder}/src/index.js`]: indexJs,
  });
}

async function problemsOf(reader: TestFolderReader) {
  const read = await readIntegrationFolder(reader, digest, folder);
  if (read.ok) throw new Error("expected problems, but the integration read");
  return read.error;
}

verifies("app.integration-folder", () => {
  it("parses the sheet and hashes every file, by its path in the folder", async () => {
    const read = await readIntegrationFolder(radarFolder(), digest, folder);
    if (!read.ok) throw new Error(JSON.stringify(read.error));
    expect(read.value.sheet.id).toBe("radar");
    expect(read.value.code).toBe(
      await integrationCodeDigest(
        [
          { path: "integration.yaml", bytes: encodeUtf8(radarSheet) },
          { path: "src/index.js", bytes: encodeUtf8(indexJs) },
        ],
        digest,
      ),
    );
  });

  it("gives another hash when one byte of a file changes", async () => {
    const before = await readIntegrationFolder(radarFolder(), digest, folder);
    const changed = radarFolder().putFiles({ [`${folder}/src/index.js`]: "export default {};\r" });
    const after = await readIntegrationFolder(changed, digest, folder);
    if (!before.ok || !after.ok) throw new Error("expected both to read");
    expect(after.value.code).not.toBe(before.value.code);
  });

  it("refuses a link anywhere in the folder before reading any file (A12)", async () => {
    const reader = radarFolder().putLink(`${folder}/src/keys`);
    reader.beforeRead = (path) => {
      throw new Error(`read ${path} although the listing has a link`);
    };
    expect(await problemsOf(reader)).toEqual([
      expect.objectContaining({ code: "link", file: "src/keys" }),
    ]);
  });

  it("refuses a special file", async () => {
    const reader = radarFolder().putSpecial(`${folder}/pipe`);
    expect(await problemsOf(reader)).toEqual([
      expect.objectContaining({ code: "special-file", file: "pipe" }),
    ]);
  });

  it("refuses a folder without a sheet, and a folder that isn't there", async () => {
    const noSheet = new TestFolderReader().putFiles({ [`${folder}/index.js`]: indexJs });
    expect(await problemsOf(noSheet)).toEqual([
      expect.objectContaining({ code: "sheet-missing", file: "" }),
    ]);
    expect(await problemsOf(new TestFolderReader())).toEqual([
      expect.objectContaining({ code: "folder-missing", file: "" }),
    ]);
  });

  it("names the sheet's own problems in integration.yaml, before reading any other file", async () => {
    const reader = radarFolder().putFiles({ [`${folder}/integration.yaml`]: "id: radar\n" });
    reader.beforeRead = (path) => {
      if (path !== `${folder}/integration.yaml`)
        throw new Error(`read ${path} past a broken sheet`);
    };
    const problems = await problemsOf(reader);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => problem.file === "integration.yaml")).toBe(true);
  });

  it("refuses a folder with too many entries or too many bytes", async () => {
    const many = radarFolder();
    for (let index = 0; index < MAX_INTEGRATION_ENTRIES; index++) {
      many.putFiles({ [`${folder}/data/${index}.txt`]: "" });
    }
    expect(await problemsOf(many)).toEqual([expect.objectContaining({ code: "too-many-files" })]);

    const large = radarFolder().putFiles({
      [`${folder}/data.bin`]: new Uint8Array(MAX_INTEGRATION_BYTES),
    });
    expect(await problemsOf(large)).toEqual([expect.objectContaining({ code: "too-large" })]);
  });

  it("says when a file is removed while it is read", async () => {
    const reader = radarFolder();
    reader.beforeRead = (path) => {
      if (path === `${folder}/src/index.js`) reader.remove(path);
    };
    expect(await problemsOf(reader)).toEqual([
      expect.objectContaining({ code: "changed-while-read", file: "src/index.js" }),
    ]);
  });
});
