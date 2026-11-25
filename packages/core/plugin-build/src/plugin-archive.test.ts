import { decodeUtf8, unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  archiveSha256,
  buildPluginArchive,
  type PluginFiles,
  snapshotPath,
  snapshotText,
} from "./plugin-archive.ts";
import { blockSize } from "./tar-header.ts";
import { readTarFile } from "./tar-read.ts";
import { acmeFiles } from "./test/acme.test-helper.ts";
import { digest } from "./test/web-crypto.test-helper.ts";

// The sha-256 of the `acme` parts' archive. It changes only when the archive's
// bytes do; a change here means every earlier build would get a new checksum.
const goldenSha256 = "f23202ca2081cdde0f1f8b398b2ea668ca9b2d6645479d650901670a7a4daa30";

/** The names in an archive, read straight from its headers in order. */
function namesIn(archive: Uint8Array): string[] {
  const names: string[] = [];
  let offset = 0;
  while (archive[offset] !== 0) {
    const header = archive.subarray(offset, offset + blockSize);
    names.push(decodeUtf8(header.subarray(0, header.indexOf(0))));
    const size = Number.parseInt(decodeUtf8(header.subarray(124, 135)), 8);
    offset += blockSize + Math.ceil(size / blockSize) * blockSize;
  }
  return names;
}

verifies("plugin-build.archive", () => {
  it("gives identical bytes for two builds of the same parts", () => {
    expect(buildPluginArchive(acmeFiles())).toEqual(buildPluginArchive(acmeFiles()));
  });

  it("gives identical bytes when the snapshot's keys come in another order", () => {
    const reordered: PluginFiles = {
      ...acmeFiles(),
      snapshot: {
        tools: [
          {
            parameters: { properties: { orderId: { type: "string" } }, type: "object" },
            description: "Tells where an order is.",
            name: "order_status",
          },
          { parameters: { type: "object" }, name: "refund", description: "Refunds an order." },
        ],
      },
    };
    expect(buildPluginArchive(reordered)).toEqual(buildPluginArchive(acmeFiles()));
  });

  it("has the golden sha-256", async () => {
    expect(await archiveSha256(buildPluginArchive(acmeFiles()), digest)).toBe(goldenSha256);
  });

  it("holds exactly the four fixed files, sorted, under package/", () => {
    expect(namesIn(buildPluginArchive(acmeFiles()))).toEqual([
      "package/manifest.js",
      "package/package.json",
      "package/snapshot.json",
      "package/worker.js",
    ]);
  });

  it("writes every header with mtime 0, mode 0644, uid and gid 0 and no owner names", () => {
    const header = buildPluginArchive(acmeFiles()).subarray(0, blockSize);
    const text = (from: number, to: number): string => decodeUtf8(header.subarray(from, to));
    expect(text(100, 108)).toBe("0000644\0");
    expect(text(108, 116)).toBe("0000000\0");
    expect(text(116, 124)).toBe("0000000\0");
    expect(text(136, 148)).toBe("00000000000\0");
    expect(header.subarray(265, 329).every((byte) => byte === 0)).toBe(true);
  });

  it("holds the snapshot as canonical JSON with a line break at the end", () => {
    const archive = buildPluginArchive(acmeFiles());
    const snapshot = decodeUtf8(unwrap(readTarFile(archive, snapshotPath, 1024)));
    expect(snapshot).toBe(snapshotText(acmeFiles().snapshot));
    expect(snapshot.endsWith("}\n")).toBe(true);
    expect(snapshotText({ tools: [{ name: "a", description: "b" }] })).toBe(
      '{"tools":[{"description":"b","name":"a"}]}\n',
    );
  });

  it("refuses a fifth part instead of writing it", () => {
    const withExtra = { ...acmeFiles(), extra: "x" } as PluginFiles;
    expect(() => buildPluginArchive(withExtra)).toThrow(
      "A plugin package has four fixed files; not extra.",
    );
  });
});
