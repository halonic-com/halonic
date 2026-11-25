import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { archiveSha256, buildPluginArchive, snapshotPath } from "./plugin-archive.ts";
import {
  maxPreviousArchiveBytes,
  maxPreviousSnapshotBytes,
  readPreviousBuild,
} from "./previous-build.ts";
import { releaseFileText } from "./release-file.ts";
import { writeTar } from "./tar-write.ts";
import { acmeCommit, acmeFiles, acmeSnapshot } from "./test/acme.test-helper.ts";
import { digest } from "./test/web-crypto.test-helper.ts";

/** A previous build's two files around an archive, with a release file that names its sha-256. */
async function previousBuild(archive: Uint8Array): Promise<{
  releaseFile: string;
  archive: Uint8Array;
}> {
  const releaseFile = releaseFileText({
    pluginId: "halonic-ws.acme",
    version: "0.1.0",
    sha256: await archiveSha256(archive, digest),
    workspaceCommit: acmeCommit,
    halonicVersion: "0.2.0",
    changes: { added: ["order_status", "refund"], removed: [], changed: [] },
  });
  return { releaseFile, archive };
}

/** An archive with only a snapshot file holding the given text. */
function archiveWithSnapshot(text: string): Uint8Array {
  return writeTar([{ name: snapshotPath, bytes: encodeUtf8(text) }]);
}

verifies("plugin-build.previous-build", () => {
  it("reads back the release file and snapshot of a build it wrote", async () => {
    const files = await previousBuild(buildPluginArchive(acmeFiles()));
    const read = await readPreviousBuild(files, digest);
    expect(read.ok && read.value.snapshot).toEqual(acmeSnapshot);
    expect(read.ok && read.value.release.version).toBe("0.1.0");
  });

  it("refuses a release file it can't read", async () => {
    const files = { releaseFile: "{}", archive: buildPluginArchive(acmeFiles()) };
    expect(await readPreviousBuild(files, digest)).toMatchObject({
      ok: false,
      error: { code: "release-file", problem: { code: "invalid" } },
    });
  });

  it("checks the sha-256 before reading a single header", async () => {
    const files = await previousBuild(buildPluginArchive(acmeFiles()));
    // Not a tar at all: a reader that looked first would say "not-our-tar".
    const swapped = { ...files, archive: encodeUtf8("not an archive") };
    expect(await readPreviousBuild(swapped, digest)).toMatchObject({
      ok: false,
      error: { code: "sha256-mismatch", actual: await archiveSha256(swapped.archive, digest) },
    });
  });

  it("refuses an archive over the size cap without hashing it", async () => {
    const files = await previousBuild(buildPluginArchive(acmeFiles()));
    const huge = { ...files, archive: new Uint8Array(maxPreviousArchiveBytes + 1) };
    const neverCalled = {
      sha256: (): Promise<Uint8Array> => Promise.reject(new Error("hashed")),
    };
    expect(await readPreviousBuild(huge, neverCalled)).toEqual({
      ok: false,
      error: { code: "archive-too-large", maxBytes: maxPreviousArchiveBytes },
    });
  });

  it("refuses an archive without package/snapshot.json", async () => {
    const archive = writeTar([{ name: "package/worker.js", bytes: encodeUtf8("x") }]);
    expect(await readPreviousBuild(await previousBuild(archive), digest)).toMatchObject({
      ok: false,
      error: { code: "archive", problem: { code: "missing", fileName: snapshotPath } },
    });
  });

  it("refuses a snapshot over the size cap", async () => {
    const archive = archiveWithSnapshot(" ".repeat(maxPreviousSnapshotBytes + 1));
    expect(await readPreviousBuild(await previousBuild(archive), digest)).toMatchObject({
      ok: false,
      error: { code: "archive", problem: { code: "too-large" } },
    });
  });

  it("refuses a snapshot that isn't JSON", async () => {
    const archive = archiveWithSnapshot("{ tools");
    expect(await readPreviousBuild(await previousBuild(archive), digest)).toEqual({
      ok: false,
      error: { code: "snapshot-not-json" },
    });
  });

  it.each([
    ["names a tool twice", '{"tools":[{"name":"a"},{"name":"a"}]}'],
    ["has no tool list", '{"tool":[]}'],
    ["has a tool without a name", '{"tools":[{"description":"x"}]}'],
    ["names a signal twice", '{"tools":[],"signals":[{"id":"a"},{"id":"a"}]}'],
    ["has a signal without an id", '{"tools":[],"signals":[{"dryRun":true}]}'],
    ["has a signal id with a capital", '{"tools":[],"signals":[{"id":"Watcher"}]}'],
    ["has a signal id that is a path", '{"tools":[],"signals":[{"id":"../x"}]}'],
    [
      "has more signals than a snapshot may",
      `{"tools":[],"signals":[${'{"id":"a"},'.repeat(50)}{"id":"b"}]}`,
    ],
    ["is nested too deep", `{"tools":[{"name":"a","x":${"[".repeat(300)}${"]".repeat(300)}}]}`],
  ])("refuses a snapshot that %s", async (_name, text) => {
    const archive = archiveWithSnapshot(text);
    expect(await readPreviousBuild(await previousBuild(archive), digest)).toMatchObject({
      ok: false,
      error: { code: "snapshot-invalid" },
    });
  });
});
