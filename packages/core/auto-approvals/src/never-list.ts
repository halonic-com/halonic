// Reads the workspace never-list: the YAML document on a pinned Paperclip
// issue that owners write. Anything Studio doesn't know fails closed, so a
// typo stops Studio instead of silently matching nothing.

import { isPlainObject } from "@halonicjs/std";
import { readYaml } from "@halonicjs/yaml";
import { normaliseClaim } from "./claims.ts";
import {
  type ApprovalType,
  approvalSources,
  approvalTypes,
  type EntryKind,
  entryKinds,
  isKnown,
  pathClasses,
  targetTypes,
} from "./vocabulary.ts";

/** The only never-list format version Studio reads. */
export const neverListVersion = 2;

/** The longest never-list text Studio reads, in characters. */
export const neverListMaxLength = 64_000;

/** One thing auto approvals never decide. */
export interface NeverListEntry {
  readonly kind: EntryKind;
  readonly value: string;
}

/** A global switch owners write: while it is there, nothing it covers is decided. */
export interface Hold {
  readonly name: string;
  readonly covers: "all" | readonly ApprovalType[];
}

/** A never-list as one revision of the document says it. */
export interface NeverList {
  readonly workspaceId: string;
  /**
   * The Studio connector's user. Optional while auto approvals run in shadow
   * mode, where there is no connector user (board, HAL-19462); live mode must
   * require it again.
   */
  readonly connectorUserId?: string;
  readonly entries: readonly NeverListEntry[];
  readonly holds: readonly Hold[];
}

/** Why a never-list can't be used. Each one stops Studio. */
export type NeverListReason =
  | "never_list.unparsable"
  | "never_list.too_large"
  | "never_list.unsupported_version"
  | "never_list.wrong_workspace"
  | "never_list.unknown_field"
  | "never_list.bad_shape"
  | "never_list.unknown_kind"
  | "never_list.unknown_value";

/** The never-list, or why Studio must stop. */
export type NeverListRead =
  | { readonly ok: true; readonly list: NeverList }
  | { readonly ok: false; readonly reason: NeverListReason };

const topLevelFields = ["version", "workspaceId", "connectorUserId", "entries", "holds"];

/** The values an entry of each kind may name; `keyword` takes any word. */
const knownValues: Readonly<Record<Exclude<EntryKind, "keyword">, readonly string[]>> = {
  approval_type: approvalTypes,
  approval_source: approvalSources,
  target_type: targetTypes,
  path_class: pathClasses,
};

/** Thrown inside the reader only, and turned back into a result by `readNeverList`. */
class NeverListProblem {
  readonly reason: NeverListReason;

  constructor(reason: NeverListReason) {
    this.reason = reason;
  }
}

function fail(reason: NeverListReason): never {
  throw new NeverListProblem(reason);
}

/**
 * Reads one revision of the never-list document.
 *
 * @param text - the document's text
 * @param workspaceId - the Paperclip company id Studio is connected to
 * @returns the list, or the reason it fails closed
 *
 * @example
 * readNeverList("version: 2\nworkspaceId: c1\nconnectorUserId: u1\nentries:\n  - kind: approval_type\n    value: hire_agnet\n", "c1");
 * // { ok: false, reason: "never_list.unknown_value" }
 */
export function readNeverList(text: string, workspaceId: string): NeverListRead {
  if (text.length > neverListMaxLength) return { ok: false, reason: "never_list.too_large" };
  const read = readYaml(text, { maxDepth: 8, maxLength: neverListMaxLength });
  if (!read.ok) return { ok: false, reason: "never_list.unparsable" };
  try {
    return { ok: true, list: neverListFrom(read.value.data, workspaceId) };
  } catch (problem) {
    if (problem instanceof NeverListProblem) return { ok: false, reason: problem.reason };
    throw problem;
  }
}

function neverListFrom(data: unknown, workspaceId: string): NeverList {
  if (!isPlainObject(data)) fail("never_list.bad_shape");
  if (Object.keys(data).some((field) => !topLevelFields.includes(field))) {
    fail("never_list.unknown_field");
  }
  if (data["version"] !== neverListVersion) fail("never_list.unsupported_version");
  if (data["workspaceId"] !== workspaceId) fail("never_list.wrong_workspace");
  const list: NeverList = {
    workspaceId,
    entries: listOf(data["entries"]).map(entryFrom),
    holds: data["holds"] === undefined ? [] : listOf(data["holds"]).map(holdFrom),
  };
  // Left out is fine; there but empty or not text still fails closed.
  if (!("connectorUserId" in data)) return list;
  return { ...list, connectorUserId: nonEmptyText(data["connectorUserId"]) };
}

function entryFrom(data: unknown): NeverListEntry {
  if (!isPlainObject(data)) fail("never_list.bad_shape");
  onlyFields(data, ["kind", "value"]);
  const kind = data["kind"];
  if (!isKnown(entryKinds, kind)) fail("never_list.unknown_kind");
  const value = nonEmptyText(data["value"]);
  if (kind === "keyword") {
    if (normaliseClaim(value).length === 0) fail("never_list.bad_shape");
    return { kind, value };
  }
  if (!knownValues[kind].includes(value)) fail("never_list.unknown_value");
  return { kind, value };
}

function holdFrom(data: unknown): Hold {
  if (!isPlainObject(data)) fail("never_list.bad_shape");
  onlyFields(data, ["name", "covers"]);
  const name = nonEmptyText(data["name"]);
  const covers = data["covers"];
  if (covers === "all") return { name, covers };
  const kinds = listOf(covers);
  if (kinds.length === 0) fail("never_list.bad_shape");
  return {
    name,
    covers: kinds.map((kind) => {
      if (!isKnown(approvalTypes, kind)) fail("never_list.unknown_value");
      return kind;
    }),
  };
}

function onlyFields(data: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(data).some((field) => !allowed.includes(field))) {
    fail("never_list.unknown_field");
  }
}

function listOf(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) fail("never_list.bad_shape");
  return value;
}

function nonEmptyText(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) fail("never_list.bad_shape");
  return value;
}
