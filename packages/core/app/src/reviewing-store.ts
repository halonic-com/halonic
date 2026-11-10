// The workspace store everyone but the review service gets (HAL-3277). It
// hides the review records, so a listing, the trust check and the
// assistant's read tools never see the baselines, and an Accept, which
// changes only a record, doesn't change the workspace's version.

import type { DefinitionStore, Digest } from "@halonicjs/ports";
import { bytesToHex, encodeUtf8 } from "@halonicjs/std";
import { reviewFolder } from "./review-record.ts";

/** Code points HFS+ ignores in a name, as the port's private-path rule removes them. */
const hfsIgnored = /[\u200C-\u200F\u202A-\u202E\u206A-\u206F\uFEFF]/gu;

/**
 * A segment the way Windows and macOS would open it, as the port matches
 * private names: without the code points HFS+ ignores, in lower case, and
 * without trailing dots and spaces.
 */
function openedAs(segment: string): string {
  return segment
    .replace(hfsIgnored, "")
    .toUpperCase()
    .toLowerCase()
    .replace(/[. ]+$/u, "");
}

const hiddenSegments = reviewFolder.split("/");

/**
 * Whether a path is the review folder or inside it, however its case or
 * trailing dots are written, so `.Halonic/Review./x` can't get round it.
 */
export function isReviewPath(path: string): boolean {
  const segments = path.split("/");
  return hiddenSegments.every((hidden, index) => {
    const segment = segments[index];
    return segment !== undefined && openedAs(segment) === hidden;
  });
}

function refuseReviewPath(path: string): void {
  if (isReviewPath(path)) {
    throw new RangeError(
      `Private workspace path ${JSON.stringify(path)}: the store doesn't serve it.`,
    );
  }
}

/**
 * The workspace's store with the review records hidden
 * (`app.review-hidden`): `list()` leaves `.halonic/review/` out, and `read`,
 * `write` and `remove` refuse it with a `RangeError`, as the port does for
 * private paths. The review service keeps the records through the store
 * underneath.
 *
 * `version()` hashes the files it lists the way the folder and memory
 * adapters do, so it is theirs as long as there are no records, and a
 * record changing alone never gives a new version.
 */
export class ReviewingDefinitionStore implements DefinitionStore {
  private readonly inner: DefinitionStore;
  private readonly digest: Digest;

  /**
   * @param inner - the workspace's store, which still serves the records
   * @param digest - hashes the files for {@link version}
   */
  constructor(inner: DefinitionStore, digest: Digest) {
    this.inner = inner;
    this.digest = digest;
  }

  get location(): string {
    return this.inner.location;
  }

  async list(dir?: string): Promise<string[]> {
    if (dir !== undefined) {
      refuseReviewPath(dir);
    }
    const paths = await this.inner.list(dir);
    return paths.filter((path) => !isReviewPath(path));
  }

  async read(path: string): Promise<string | null> {
    refuseReviewPath(path);
    return this.inner.read(path);
  }

  async write(path: string, content: string): Promise<void> {
    refuseReviewPath(path);
    await this.inner.write(path, content);
  }

  async remove(path: string): Promise<void> {
    refuseReviewPath(path);
    await this.inner.remove(path);
  }

  /** A content hash of every listed file, `sha256:` and 16 hex characters, as the adapters make it. */
  async version(): Promise<string> {
    const parts: string[] = [];
    for (const path of await this.list()) {
      const content = await this.inner.read(path);
      if (content !== null) {
        parts.push(`${path}\n${content}`);
      }
    }
    const hash = await this.digest.sha256(encodeUtf8(parts.join("\n\0")));
    return `sha256:${bytesToHex(hash).slice(0, 16)}`;
  }
}
