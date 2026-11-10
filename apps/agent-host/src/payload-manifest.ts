/**
 * What the build embeds in the executable next to the payload: the files the
 * host runs from, with a digest of each. The executable unpacks them into a
 * folder named after {@link PayloadManifest.digest} and checks every file
 * against its digest before it loads anything.
 *
 * Each file is embedded as its own single-executable asset, whose key is the
 * file's payload path. The build puts the manifest itself in front of the
 * entry point, as it does the version, so the entry point imports nothing.
 *
 * Types only: the entry point imports this file with `import type`, which
 * the build removes.
 */
export interface PayloadManifest {
  /**
   * SHA-256 of every file's path and digest, in hex. It changes whenever a
   * file is added, removed or changed, so a new build never reuses an old
   * folder.
   */
  digest: string;
  /** Where each workspace package is in the payload, by its npm name, such as "packages/core/ports". */
  packages: Record<string, string>;
  /** Every file, sorted by path. */
  files: PayloadManifestFile[];
}

/** One file of the payload. */
export interface PayloadManifestFile {
  /** Relative to the payload's root, with `/` between folders, such as "node_modules/zod/index.js". */
  path: string;
  /** SHA-256 of its bytes, in hex. */
  sha256: string;
  /** Its size in bytes. */
  size: number;
  /** Whether it is a program the host or sandbox-runtime starts, such as `apply-seccomp`, so it is unpacked executable. */
  executable: boolean;
}
