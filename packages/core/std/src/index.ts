// The public API of @halonicjs/std. Everything else in src/ is internal.
export { asciiHost } from "./ascii-host.ts";
export { AssertionError, assert, assertDefined, assertNever } from "./assert.ts";
export { decodeBase64url, encodeBase64url } from "./base64url.ts";
export { canonicalJson } from "./canonical-json.ts";
export { type Clock, fixedClock, fixedClockStart, systemClock } from "./clock.ts";
export { constantTimeEqual } from "./constant-time.ts";
export { contentDigest, matchesExpected, type Sha256 } from "./content-digest.ts";
export { deepClone } from "./deep-clone.ts";
export { deepEqual } from "./deep-equal.ts";
export { Emitter, type Listener } from "./emitter.ts";
export {
  type ErrorKind,
  errorKindOf,
  errorKinds,
  isErrorKind,
  KindedError,
} from "./error-kind.ts";
export { bytesToHex } from "./hex.ts";
export { fixedIds, type IdGenerator, type RandomBytes, randomIds } from "./ids.ts";
export { KeyedQueue } from "./keyed-queue.ts";
export {
  applyLineChanges,
  type DiffLinesOptions,
  diffLines,
  type LineChange,
  MAX_COMPARED_LINE_PAIRS,
  splitLines,
} from "./line-diff.ts";
export {
  hasConflicts,
  type MergeLinesOptions,
  type MergeRegion,
  mergedText,
  mergeLines,
} from "./line-merge.ts";
export { describeObject, isPlainObject, keyPath } from "./plain-data.ts";
export { posixPath } from "./posix-path.ts";
export { type Err, err, mapResult, type Ok, ok, type Result, unwrap } from "./result.ts";
export { SecretScrubber, secretRemoved, secretTextForms } from "./secret-scrubber.ts";
export { findSecretShape, type SecretShape } from "./secret-shape.ts";
export { type StopSignal, StopSource } from "./stop-signal.ts";
export { slugify, uniqueName } from "./text.ts";
export { decodeUtf8, encodeUtf8 } from "./utf8.ts";
export { compareVersions, formatVersion, isAtLeast, readVersion, type Version } from "./version.ts";
