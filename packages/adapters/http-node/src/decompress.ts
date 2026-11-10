import { pipeline, type Readable } from "node:stream";
import * as zlib from "node:zlib";

/** The codings a `content-encoding` header lists, in the order they were applied; `identity` left out. */
export function contentCodings(contentEncoding: string | null): string[] {
  return (contentEncoding ?? "")
    .split(",")
    .map((coding) => coding.trim().toLowerCase())
    .filter((coding) => coding !== "" && coding !== "identity");
}

/**
 * The response body with every coding undone, last one first.
 * The transport decompresses itself so that the kit's secret filter and size
 * limit see the real bytes: a gzip echo of a key can't slip past the filter.
 *
 * @throws TypeError for an encoding it can't undo, rather than pass on bytes nobody checked
 */
export function decompressed(body: Readable, codings: readonly string[]): Readable {
  const decoders = [...codings].reverse().map(decoderFor);
  let current = body;
  for (const decoder of decoders) {
    current = pipeline(current, decoder, () => {
      // pipeline destroys every stream on an error, so the body's reader sees it.
    });
  }
  return current;
}

function decoderFor(coding: string): NodeJS.ReadWriteStream & Readable {
  switch (coding) {
    case "gzip":
    case "x-gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    case "zstd":
      return zlib.createZstdDecompress();
    default:
      throw new TypeError(
        `the response uses a content-encoding the transport can't undo: ${coding}`,
      );
  }
}
