import type { Place } from "./place.ts";

/** The base image of a Dockerfile: its full `FROM` reference, digest included. */
export interface ApprovedBase {
  readonly image: string;
  readonly reason: string;
}

/** One file a Dockerfile downloads with `ADD --checksum`. */
export interface ApprovedArtifact {
  readonly version: string;
  readonly sha256: string;
  readonly url: string;
  /** Why it is in the image; absent when `partOf` names the artifact whose reason it shares. */
  readonly reason?: string;
  /** Another artifact of the same image whose reason covers this one, e.g. srt for its own dependencies. */
  readonly partOf?: string;
  /** The task holding the board's approval of this artifact at this version. */
  readonly approvedOn: string;
}

/** A Debian package a Dockerfile installs with `apt-get install`. */
export interface ApprovedAptPackage {
  readonly name: string;
  readonly reason: string;
}

/** What one Dockerfile may put in its image. */
export interface ApprovedImage {
  readonly base: ApprovedBase;
  readonly artifacts: Readonly<Record<string, ApprovedArtifact>>;
  readonly aptPackages: readonly ApprovedAptPackage[];
}

const sha256Pattern = /^[0-9a-f]{64}$/;

/** Reads the `images` section of `dependencies.json`, keyed by the Dockerfile's path from the repo root. */
export function parseImages(at: Place, value: unknown): Record<string, ApprovedImage> {
  const images: Record<string, ApprovedImage> = {};
  for (const [dockerfile, raw] of Object.entries(at.object(value, "images", undefined))) {
    const field = `images["${dockerfile}"]`;
    const entry = at.object(raw, field, ["base", "artifacts"], ["aptPackages"]);
    const base = at.object(entry["base"], `${field}.base`, ["image", "reason"]);
    images[dockerfile] = {
      base: {
        image: at.text(base["image"], `${field}.base.image`),
        reason: at.text(base["reason"], `${field}.base.reason`),
      },
      artifacts: parseArtifacts(at, entry["artifacts"], `${field}.artifacts`),
      aptPackages:
        entry["aptPackages"] === undefined
          ? []
          : parseAptPackages(at, entry["aptPackages"], `${field}.aptPackages`),
    };
  }
  return images;
}

function parseArtifacts(
  at: Place,
  value: unknown,
  field: string,
): Record<string, ApprovedArtifact> {
  const entries = at.object(value, field, undefined);
  const artifacts: Record<string, ApprovedArtifact> = {};
  for (const [name, raw] of Object.entries(entries)) {
    const artifactField = `${field}["${name}"]`;
    const entry = at.object(
      raw,
      artifactField,
      ["version", "sha256", "url", "approvedOn"],
      ["reason", "partOf"],
    );
    const sha256 = at.text(entry["sha256"], `${artifactField}.sha256`);
    if (!sha256Pattern.test(sha256)) {
      at.fail(`${artifactField}.sha256`, "must be 64 lowercase hex digits");
    }
    const partOf =
      entry["partOf"] === undefined
        ? undefined
        : at.text(entry["partOf"], `${artifactField}.partOf`);
    if (partOf === undefined && entry["reason"] === undefined) {
      at.fail(
        `${artifactField}.reason`,
        "is missing (or set partOf to the artifact whose reason it shares)",
      );
    }
    if (partOf !== undefined && !Object.hasOwn(entries, partOf)) {
      at.fail(
        `${artifactField}.partOf`,
        `names "${partOf}", which is not an artifact of this image`,
      );
    }
    artifacts[name] = {
      version: at.text(entry["version"], `${artifactField}.version`),
      sha256,
      url: at.text(entry["url"], `${artifactField}.url`),
      approvedOn: at.text(entry["approvedOn"], `${artifactField}.approvedOn`),
      ...(entry["reason"] === undefined
        ? {}
        : { reason: at.text(entry["reason"], `${artifactField}.reason`) }),
      ...(partOf === undefined ? {} : { partOf }),
    };
  }
  return artifacts;
}

function parseAptPackages(at: Place, value: unknown, field: string): ApprovedAptPackage[] {
  if (!Array.isArray(value)) {
    return at.fail(field, "must be a list of { name, reason }");
  }
  return value.map((raw, index) => {
    const entry = at.object(raw, `${field}[${index}]`, ["name", "reason"]);
    return {
      name: at.text(entry["name"], `${field}[${index}].name`),
      reason: at.text(entry["reason"], `${field}[${index}].reason`),
    };
  });
}
