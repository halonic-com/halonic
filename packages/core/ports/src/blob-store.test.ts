import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { checkBlobMediaType, isBlobHash } from "./index.ts";

const helloHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

// The blob stores of memory, fs-node and fs-tauri use these rules; the BlobStore contract checks them through each.
verifies("ports.blob-store-checks", () => {
  it.each(["text/plain", "application/vnd.acme+json", "image/svg+xml"])(
    "takes the media type %s",
    (mediaType) => {
      expect(() => checkBlobMediaType(mediaType)).not.toThrow();
    },
  );

  it.each(["text/plain; charset=utf-8", "text", "tëxt/plain", "text/plain\n", ""])(
    "refuses the media type %j",
    (mediaType) => {
      expect(() => checkBlobMediaType(mediaType)).toThrow(
        new RangeError(
          `Media type ${JSON.stringify(mediaType)} is not type/subtype without parameters.`,
        ),
      );
    },
  );

  it("takes only 64 lowercase hex characters as a hash", () => {
    expect(isBlobHash(helloHash)).toBe(true);
    expect(isBlobHash(helloHash.toUpperCase())).toBe(false);
    expect(isBlobHash(helloHash.slice(1))).toBe(false);
    expect(isBlobHash(`../${helloHash.slice(3)}`)).toBe(false);
    expect(isBlobHash(`${helloHash}\n`)).toBe(false);
  });
});
