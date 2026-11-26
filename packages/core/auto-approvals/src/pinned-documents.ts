// The two documents on the pinned never-list issue (design sections 4 and 8):
// the never-list, which only owners write and which must stay locked, and the
// stop document, which anyone may write to stop every Studio. Studio decides
// only while both check out; anything else stops it.

import { type Clock, isPlainObject } from "@halonicjs/std";
import { readYaml } from "@halonicjs/yaml";
import {
  type EffectiveNeverList,
  type EffectiveNeverListRead,
  effectiveNeverList,
} from "./effective-list.ts";

/** One revision of a pinned document, as Paperclip's revision history gives it. */
export interface DocumentRevision {
  readonly id: string;
  readonly revisionNumber: number;
  readonly body: string;
  /** When Paperclip stored it, as Paperclip writes it. */
  readonly createdAt: string;
  /** The person who wrote it, or `null` when an agent did. */
  readonly authorUserId: string | null;
  /** The agent who wrote it, or `null` when a person did. */
  readonly authorAgentId: string | null;
}

/** A pinned document and its whole revision history, read from Paperclip. */
export interface PinnedDocument {
  readonly id: string;
  readonly issueId: string;
  readonly companyId: string;
  /** Whether Paperclip holds the document locked (a server fact). */
  readonly locked: boolean;
  readonly latestRevisionId: string | null;
  readonly revisions: readonly DocumentRevision[];
}

/** What an owner configured in Studio. Studio never looks the documents up by key. */
export interface DocumentPins {
  readonly workspaceId: string;
  readonly issueId: string;
  readonly neverListDocumentId: string;
  readonly stopDocumentId: string;
  /** The board users with authority over the never-list. */
  readonly ownerUserIds: readonly string[];
}

/** Why the stop document stops Studio. */
export type StopReason =
  /** Not the pinned document, issue or company. */
  | "stop.wrong_document"
  /** No single newest revision, or it isn't the document's latest. */
  | "stop.missing"
  /** Anyone may stop: the newest revision isn't an owner's. */
  | "stop.not_owner_latest"
  /** An owner wrote `stop: true`. */
  | "stop.stopped"
  /** An owner wrote something other than `stop: false` or `stop: true`. */
  | "stop.unreadable";

/** Why the never-list document stops Studio, besides its content and history. */
export type PinnedNeverListReason =
  | "never_list.wrong_document"
  | "never_list.unlocked"
  | "never_list.stale_revision";

/** Why Studio may not decide anything now. */
export type DocumentGateReason =
  | StopReason
  | PinnedNeverListReason
  | Extract<EffectiveNeverListRead, { ok: false }>["reason"];

/** The never-list in force, or why Studio must stop. */
export type DocumentGate =
  | { readonly ok: true; readonly list: EffectiveNeverList }
  | { readonly ok: false; readonly reason: DocumentGateReason };

/**
 * Checks the stop document first, because anyone may stop, then the never-list:
 * the pinned ids and company, the lock, and a revision history whose newest
 * entry is the document's latest and an owner's.
 *
 * @param documents - both documents as just read from Paperclip
 * @param pins - the ids and owners an owner configured
 * @param clock - the time to judge the never-list's 24-hour delay by
 */
export function checkPinnedDocuments(
  documents: { readonly neverList: PinnedDocument; readonly stop: PinnedDocument },
  pins: DocumentPins,
  clock: Clock,
): DocumentGate {
  const stop = stopReason(documents.stop, pins);
  if (stop !== undefined) return { ok: false, reason: stop };
  const { neverList } = documents;
  if (!isPinned(neverList, pins.neverListDocumentId, pins)) {
    return { ok: false, reason: "never_list.wrong_document" };
  }
  if (!neverList.locked) return { ok: false, reason: "never_list.unlocked" };
  if (newestOf(neverList)?.id !== neverList.latestRevisionId) {
    return { ok: false, reason: "never_list.stale_revision" };
  }
  const revisions = neverList.revisions.map((revision) => ({
    text: revision.body,
    revisionNumber: revision.revisionNumber,
    writtenAt: new Date(revision.createdAt),
    ownerWritten: isOwners(revision, pins),
  }));
  return effectiveNeverList(revisions, pins.workspaceId, clock);
}

/** Why the stop document stops Studio, or `undefined` while it says `stop: false`. */
function stopReason(stop: PinnedDocument, pins: DocumentPins): StopReason | undefined {
  if (!isPinned(stop, pins.stopDocumentId, pins)) return "stop.wrong_document";
  const newest = newestOf(stop);
  if (newest === undefined || newest.id !== stop.latestRevisionId) return "stop.missing";
  if (!isOwners(newest, pins)) return "stop.not_owner_latest";
  const read = readYaml(newest.body, { maxDepth: 2, maxLength: 1_000 });
  const data = read.ok ? read.value.data : undefined;
  if (!isPlainObject(data) || Object.keys(data).length !== 1) return "stop.unreadable";
  if (data["stop"] === false) return undefined;
  return data["stop"] === true ? "stop.stopped" : "stop.unreadable";
}

function isPinned(document: PinnedDocument, documentId: string, pins: DocumentPins): boolean {
  return (
    document.id === documentId &&
    document.issueId === pins.issueId &&
    document.companyId === pins.workspaceId
  );
}

/** The one revision with the highest number, or `undefined` when there is none or two share it. */
function newestOf(document: PinnedDocument): DocumentRevision | undefined {
  const [newest, runnerUp] = [...document.revisions].sort(
    (a, b) => b.revisionNumber - a.revisionNumber,
  );
  return runnerUp?.revisionNumber === newest?.revisionNumber ? undefined : newest;
}

/** An owner wrote it: a listed board user, and no agent. */
function isOwners(revision: DocumentRevision, pins: DocumentPins): boolean {
  return (
    revision.authorAgentId === null &&
    revision.authorUserId !== null &&
    pins.ownerUserIds.includes(revision.authorUserId)
  );
}
