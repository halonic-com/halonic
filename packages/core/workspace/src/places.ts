import { type FilePlace, fileKinds, type KindName, kindNames } from "@halonicjs/format";

/** Where a workspace's own settings live; every workspace has one. */
export const settingsPath = "workspace.yaml";

/** What a workspace path is, from where it sits: its kind, its hub and the id its place gives. */
export interface PlaceMatch {
  readonly kind: KindName;
  /** The hub folder the file sits in, or `null` at the workspace root. */
  readonly hub: string | null;
  /**
   * The id the file's place gives: the `<id>` part of its name (its file
   * name without the kind's suffix, or its folder for `<id>/SKILL.md`), or
   * the hub folder for a file that is the hub's own, such as `hub.yaml`.
   * Absent for workspace files such as `models.yaml`.
   */
  readonly placeId?: string;
}

interface PlacePattern {
  readonly kind: KindName;
  readonly pattern: RegExp;
  /** Whether the pattern's first group is the hub folder. */
  readonly inHub: boolean;
  /** Whether the pattern has a group for the file name's `<id>`. */
  readonly hasId: boolean;
}

const idToken = "<id>";
// One path segment: `<id>` and a hub folder never span a "/".
const segment = "([^/]+)";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The pattern of one place, at the workspace root or inside a hub. */
function patternOf(kind: KindName, place: FilePlace, inHub: boolean): PlacePattern {
  const hubPart = inHub ? `hubs/${segment}/` : "";
  const folderPart = place.folder === "" ? "" : `${escapeRegExp(place.folder)}/`;
  const namePart = place.name.split(idToken).map(escapeRegExp).join(segment);
  return {
    kind,
    pattern: new RegExp(`^${hubPart}${folderPart}${namePart}$`),
    inHub,
    hasId: place.name.includes(idToken),
  };
}

/**
 * Every place of every registered kind, in the registry's order. The kinds
 * drive the loader: a new kind with a place is found without a change here.
 */
function placePatterns(): PlacePattern[] {
  return kindNames().flatMap((kind) =>
    fileKinds[kind].places.flatMap((place) => {
      const patterns: PlacePattern[] = [];
      if (place.scope !== "hub") {
        patterns.push(patternOf(kind, place, false));
      }
      if (place.scope !== "workspace") {
        patterns.push(patternOf(kind, place, true));
      }
      return patterns;
    }),
  );
}

const patterns = placePatterns();

/**
 * The kind, hub and place id of a workspace-relative path, or `undefined`
 * for a file no kind places, such as a README. No two registered places
 * match the same path (a test keeps it so); if a future kind's place did,
 * the kind registered first would win.
 *
 * @example
 * placeOf("hubs/billing/agents/clerk.agent.yaml"); // { kind: "agent", hub: "billing", placeId: "clerk" }
 * placeOf("hubs/billing/hub.yaml"); // { kind: "hub", hub: "billing", placeId: "billing" }
 */
export function placeOf(path: string): PlaceMatch | undefined {
  return placeMatches(path)[0];
}

/**
 * Every registered place that matches a path, in the registry's order.
 * Exported for the tests, not from the package.
 */
export function placeMatches(path: string): PlaceMatch[] {
  const matches: PlaceMatch[] = [];
  for (const place of patterns) {
    const match = place.pattern.exec(path);
    if (match === null) {
      continue;
    }
    const hub = place.inHub ? (match[1] ?? null) : null;
    const nameId = place.hasId ? match[place.inHub ? 2 : 1] : undefined;
    const placeId = nameId ?? hub ?? undefined;
    matches.push(
      placeId === undefined ? { kind: place.kind, hub } : { kind: place.kind, hub, placeId },
    );
  }
  return matches;
}
