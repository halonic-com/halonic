// The workspace never-list (design section 4): what auto approvals must never
// decide, read from the pinned, locked issue document. Reading fails closed: any
// field, kind or value we don't know gives no list at all, and Studio decides nothing.

import { isPlainObject } from "@halonicjs/std";
import { readYaml } from "@halonicjs/yaml";
import { normaliseForKeywords } from "./keyword.ts";
import {
  type ApprovalType,
  approvalTypes,
  type EntryKind,
  entryValues,
  isOneOf,
  type ListedKind,
} from "./known-values.ts";

/** One thing auto approvals never decide. */
export interface NeverListEntry {
  readonly kind: EntryKind;
  readonly value: string;
}

/** A global switch an owner writes: while it is on, nothing in `covers` is decided. */
export interface Hold {
  readonly name: string;
  readonly covers: "all" | readonly ApprovalType[];
}

export interface NeverList {
  readonly workspaceId: string;
  readonly connectorUserId: string;
  readonly entries: readonly NeverListEntry[];
  readonly holds: readonly Hold[];
}

export type NeverListReason =
  | "never_list.unparsable"
  | "never_list.unknown_field"
  | "never_list.missing_field"
  | "never_list.wrong_version"
  | "never_list.wrong_workspace"
  | "never_list.unknown_kind"
  | "never_list.unknown_value"
  | "never_list.bad_hold";

export type NeverListRead =
  | { readonly ok: true; readonly list: NeverList }
  | { readonly ok: false; readonly reason: NeverListReason };

/** The never-list format version this code reads. */
export const neverListVersion = 2;

/**
 * The board's seed list, built into Studio (design section 4, rule 5). These
 * entries apply even when the workspace document leaves them out, so removing
 * one also needs a change here, reviewed by Liam.
 */
export const seedEntries: readonly NeverListEntry[] = [
  { kind: "approval_type", value: "hire_agent" },
  { kind: "approval_type", value: "approve_ceo_strategy" },
  { kind: "approval_type", value: "budget_override_required" },
  { kind: "approval_source", value: "tool_gateway" },
  { kind: "path_class", value: "security" },
  { kind: "path_class", value: "release" },
  { kind: "keyword", value: "secret" },
];

const topLevelFields = ["version", "workspaceId", "connectorUserId", "entries", "holds"] as const;

/** A failed read, for one reason. */
class ReadFailure extends Error {
  readonly reason: NeverListReason;

  constructor(reason: NeverListReason) {
    super(reason);
    this.reason = reason;
  }
}

function fail(reason: NeverListReason): never {
  throw new ReadFailure(reason);
}

/**
 * Reads the never-list document's text for the workspace `workspaceId`. The
 * seed entries are always part of the list that comes back.
 *
 * @example
 * readNeverList("version: 2\n…\n  - kind: approval_type\n    value: hire_agnet\n", { workspaceId });
 * // { ok: false, reason: "never_list.unknown_value" }
 */
export function readNeverList(text: string, expected: { workspaceId: string }): NeverListRead {
  const read = readYaml(text);
  if (!read.ok) return { ok: false, reason: "never_list.unparsable" };
  try {
    return { ok: true, list: withSeedFloor(neverListFrom(read.value.data, expected)) };
  } catch (error) {
    if (error instanceof ReadFailure) return { ok: false, reason: error.reason };
    throw error;
  }
}

/** `list` with every seed entry it leaves out added back. */
export function withSeedFloor(list: NeverList): NeverList {
  const missing = seedEntries.filter(
    (seed) => !list.entries.some((entry) => sameEntry(entry, seed)),
  );
  return { ...list, entries: [...list.entries, ...missing] };
}

export function sameEntry(a: NeverListEntry, b: NeverListEntry): boolean {
  return a.kind === b.kind && a.value === b.value;
}

function neverListFrom(data: unknown, expected: { workspaceId: string }): NeverList {
  const fields = mapWithOnly(data, topLevelFields);
  if (fields.version !== neverListVersion) fail("never_list.wrong_version");
  const workspaceId = requiredText(fields.workspaceId);
  if (workspaceId !== expected.workspaceId) fail("never_list.wrong_workspace");
  return {
    workspaceId,
    connectorUserId: requiredText(fields.connectorUserId),
    entries: listOf(fields.entries).map(entryFrom),
    holds: fields.holds === undefined ? [] : listOf(fields.holds).map(holdFrom),
  };
}

function entryFrom(data: unknown): NeverListEntry {
  const fields = mapWithOnly(data, ["kind", "value"]);
  const value = requiredText(fields.value);
  if (fields.kind === "keyword") {
    if (normaliseForKeywords(value).trim() === "") fail("never_list.unknown_value");
    return { kind: "keyword", value };
  }
  if (!isOneOf(Object.keys(entryValues) as ListedKind[], fields.kind))
    fail("never_list.unknown_kind");
  if (!isOneOf(entryValues[fields.kind], value)) fail("never_list.unknown_value");
  return { kind: fields.kind, value };
}

function holdFrom(data: unknown): Hold {
  const fields = mapWithOnly(data, ["name", "covers"]);
  const name = requiredText(fields.name);
  if (fields.covers === "all") return { name, covers: "all" };
  if (!Array.isArray(fields.covers) || fields.covers.length === 0) fail("never_list.bad_hold");
  const covers = fields.covers.map((type) =>
    isOneOf(approvalTypes, type) ? type : fail("never_list.unknown_value"),
  );
  return { name, covers };
}

/** `data` as a map whose keys are all in `allowed`. */
function mapWithOnly<Key extends string>(
  data: unknown,
  allowed: readonly Key[],
): Partial<Record<Key, unknown>> {
  if (!isPlainObject(data)) fail("never_list.unparsable");
  if (Object.keys(data).some((key) => !isOneOf(allowed, key))) fail("never_list.unknown_field");
  return data as Partial<Record<Key, unknown>>;
}

function listOf(data: unknown): readonly unknown[] {
  if (data === undefined) fail("never_list.missing_field");
  return Array.isArray(data) ? data : fail("never_list.unparsable");
}

function requiredText(data: unknown): string {
  if (data === undefined) fail("never_list.missing_field");
  return typeof data === "string" && data !== "" ? data : fail("never_list.unparsable");
}
