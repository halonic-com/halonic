import type { Sha256 } from "@halonicjs/std";
import {
  archiveFileName,
  archiveSha256,
  buildPluginArchive,
  changeList,
  nextPluginVersion,
  type PluginSnapshot,
  pluginIdFor,
  readPreviousBuild,
  releaseFileText,
  snapshotSha256,
} from "../src/index.ts";

/**
 * Builds the `acme` plugin's archive and release file, then reads them back
 * as a later build's `--since` does.
 */
export async function runExample(digest: Sha256): Promise<{
  pluginId: string | undefined;
  archive: string;
  added: readonly string[];
  readBack: number | undefined;
}> {
  const pluginId = pluginIdFor("acme"); // ok("halonic-ws.acme"); "../acme" is refused
  const version = nextPluginVersion({}); // ok("0.1.0"): no --version, no previous build
  if (!pluginId.ok || !version.ok) {
    return { pluginId: undefined, archive: "", added: [], readBack: undefined };
  }
  const snapshot: PluginSnapshot = { tools: [{ name: "order_status", description: "…" }] };

  // The four fixed files, nothing else; the same input always gives the same bytes.
  const archive = buildPluginArchive({
    packageJson: '{"name":"halonic-ws.acme"}\n',
    manifest: "export default {};\n",
    worker: new Uint8Array(),
    snapshot,
  });
  const changes = changeList(undefined, snapshot); // every tool is added
  const releaseFile = releaseFileText({
    pluginId: pluginId.value,
    version: version.value,
    sha256: await archiveSha256(archive, digest),
    snapshotSha256: await snapshotSha256(snapshot, digest), // what the pin settings ask for
    workspaceCommit: "0123456789abcdef0123456789abcdef01234567",
    halonicVersion: "0.2.0",
    changes,
  });

  // The sha-256 is checked before the archive is read; only the snapshot comes back.
  const previous = await readPreviousBuild({ releaseFile, archive }, digest);
  return {
    pluginId: pluginId.value,
    archive: archiveFileName(pluginId.value, version.value), // "halonic-ws.acme-0.1.0.tar"
    added: changes.added, // ["order_status"]
    readBack: previous.ok ? previous.value.snapshot.tools.length : undefined, // 1
  };
}
