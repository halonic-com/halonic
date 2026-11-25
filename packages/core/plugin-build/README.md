# @halonicjs/plugin-build

Builds a Paperclip plugin's bytes from a workspace's snapshot: a reproducible, uncompressed ustar
archive with exactly four fixed files, its sha-256, the release file next to it, and the change
list since the previous build. It reads a previous build back for `--since`, as untrusted data.

- **Layer:** core
- **Owner:** noah
- **Public API:** `@halonicjs/plugin-build`

The package has no files, git or network of its own: bytes in, bytes out. The app service behind
`halonic build paperclip-plugin` (HAL-17950) reads the workspace, calls this package and writes
the files. The core has no hash code, so the caller passes in a `Sha256` (the `Digest` port, which
asks the platform's Web Crypto).

## Example

The code lives in [`examples/build-and-read-back.ts`](examples/build-and-read-back.ts), where it is
typechecked and run by `src/example.test.ts`; keep this copy in step with it.

```ts
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
} from "@halonicjs/plugin-build";

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
```

## What it gives you

| Export | What it does |
| --- | --- |
| `pluginIdFor(name)` | `halonic-ws.<name>`, or a refusal when the id doesn't match `^halonic-ws\.[a-z0-9][a-z0-9-]{0,62}$`. The id becomes part of file names, so nothing else may reach a path. |
| `nextPluginVersion({ requested, previous })` | `--version` if given, otherwise the previous version with the minor raised, otherwise `0.1.0`. Only strict `x.y.z`. |
| `buildPluginArchive(files)` | The archive: `package/manifest.js`, `package/package.json`, `package/snapshot.json` and `package/worker.js`, sorted, mtime 0, mode 0644, uid and gid 0, empty owner names. Uncompressed, because gzip's bytes depend on the zlib version. |
| `archiveSha256(archive, digest)` | The archive's sha-256, as 64 lowercase hex characters. |
| `snapshotSha256(snapshot, digest)` | The sha-256 of `package/snapshot.json` as the archive holds it: the release file's `snapshotSha256`, which the plugin's pin settings ask for. |
| `changeList(previous, current)` | The tools added, removed and changed (with the changed fields), each list sorted. |
| `releaseFileText(fields)`, `parseReleaseFile(text)` | Write and strictly read the release file (canonical JSON, a line break at the end). |
| `readPreviousBuild(files, digest)` | Reads a previous build for `--since`: the release file strictly, the archive's sha-256 before any header, then only `package/snapshot.json`, size-capped and checked as untrusted data. |

The snapshot type is a local, minimal one for now (tools with a name and other JSON fields). It
becomes 1a-1's snapshot (HAL-17948) once that is on `main`.
