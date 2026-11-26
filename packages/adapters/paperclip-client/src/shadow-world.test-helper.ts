import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  type LedgerEntry,
  type LedgerStore,
  runEntryId,
  ShadowRunner,
  type ShadowSource,
} from "@halonicjs/auto-approvals";
import { company } from "./acme-data.test-helper.ts";
import { FakePaperclip, type SeenRequest } from "./fake-paperclip.test-helper.ts";
import { PaperclipShadowReader } from "./shadow-reads.ts";

// The made-up world of Julian's red-team cases (HAL-19463): baseline B0, which every row changes
// in one place, served by the fake Paperclip and read through the real shadow reader.

export const pinnedIssue = "i0000000-0000-4000-8000-0000000000c1";
export const neverListId = "d0000000-0000-4000-8000-0000000000c1";
export const stopId = "d0000000-0000-4000-8000-0000000000c2";
export const owner = "u0000000-0000-4000-8000-0000000000c1";
export const admin = "u0000000-0000-4000-8000-0000000000c2";
export const agentA = "a0000000-0000-4000-8000-0000000000c1";
export const agentB = "a0000000-0000-4000-8000-0000000000c2";
export const firstApproval = "p0000000-0000-4000-8000-0000000000c1";
export const linkedIssue = "i0000000-0000-4000-8000-0000000000c2";
export const otherCompany = "c0000000-0000-4000-8000-0000000000c9";

/** The key the fake connection holds: it must never show up anywhere (A36). */
export const canaryKey = "CANARY-A36-pcp_board_key";

/** B0's time: the approval's creation, and both clocks. */
export const t0 = new Date("2026-11-27T10:00:00.000Z");

export const hour = 60 * 60 * 1000;

type Json = Record<string, unknown>;

/** One approval as the fake serves it. */
export interface WorldApproval {
  record: Json;
  activity: Json[];
  comments: Json[];
  issues: Json[];
}

/** One pinned document and its revisions. */
export interface WorldDocument {
  document: Json;
  revisions: Json[];
}

/** Everything the fake Paperclip serves; tests change it between polls. */
export interface World {
  approvals: WorldApproval[];
  neverList: WorldDocument;
  stop: WorldDocument;
  serverTime: Date | undefined;
  laptopTime: Date;
  /** Answers to replace, by route (`GET /api/...`), for the read-failure rows. */
  overrides: Map<string, (request: SeenRequest) => Response | Promise<Response>>;
}

/** The seed never-list text, with extra keyword entries. */
export function neverListText(keywords: readonly string[] = [], extra = ""): string {
  const entries = keywords.map((value) => `  - kind: keyword\n    value: ${value}\n`).join("");
  return `version: 2\nworkspaceId: ${company}\nentries:${entries === "" ? " []\n" : `\n${entries}`}${extra}`;
}

/** A revision of a pinned document. */
export function revision(
  documentId: string,
  revisionNumber: number,
  body: string,
  options: { at?: Date; user?: string | null; agent?: string | null } = {},
): Json {
  return {
    id: `${documentId.slice(0, -2)}${String(revisionNumber).padStart(2, "0")}`,
    companyId: company,
    documentId,
    issueId: pinnedIssue,
    revisionNumber,
    body,
    createdByUserId: options.agent == null ? (options.user ?? owner) : null,
    createdByAgentId: options.agent ?? null,
    createdAt: (options.at ?? new Date(t0.getTime() - 48 * hour)).toISOString(),
  };
}

/** Points the document at its newest revision, as Paperclip keeps it. */
export function setRevisions(document: WorldDocument, revisions: Json[]): void {
  document.revisions = revisions;
  const newest = revisions.at(-1);
  document.document = { ...document.document, latestRevisionId: newest?.["id"] ?? null };
}

function pinned(id: string, key: string, body: string): WorldDocument {
  const document: WorldDocument = {
    document: { id, companyId: company, issueId: pinnedIssue, key, lockedAt: t0.toISOString() },
    revisions: [],
  };
  setRevisions(document, [revision(id, 1, body)]);
  return document;
}

/** One clean pending approval, as B0 describes it. */
export function cleanApproval(id = firstApproval, requester = agentA): WorldApproval {
  return {
    record: {
      id,
      companyId: company,
      type: "request_board_approval",
      status: "pending",
      requestedByAgentId: requester,
      decidedByUserId: null,
      payload: {
        title: "Publish docs revision",
        issueId: linkedIssue,
        revisionId: "r0000000-0000-4000-8000-0000000000c1",
      },
      createdAt: t0.toISOString(),
      updatedAt: t0.toISOString(),
    },
    activity: [activity(id, "approval.created", "agent", requester)],
    comments: [],
    issues: [{ id: linkedIssue, companyId: company, title: "Docs page", description: "Weekly" }],
  };
}

/** An activity entry for approval `id`. */
export function activity(id: string, action: string, actorType: string, actorId: string): Json {
  return {
    companyId: company,
    entityType: "approval",
    entityId: id,
    action,
    actorType,
    actorId,
    createdAt: t0.toISOString(),
  };
}

/** A comment on approval `id`, by an agent or a person. */
export function comment(id: string, by: "agent" | "user", body: string): Json {
  return {
    companyId: company,
    approvalId: id,
    authorAgentId: by === "agent" ? agentA : null,
    authorUserId: by === "user" ? owner : null,
    body,
  };
}

/** Baseline B0. */
export function b0(): World {
  return {
    approvals: [cleanApproval()],
    neverList: pinned(neverListId, "never-list", neverListText()),
    stop: pinned(stopId, "auto-approve-stop", "stop: false\n"),
    serverTime: t0,
    laptopTime: t0,
    overrides: new Map(),
  };
}

/** The first approval of the world, for rows that change it. */
export function first(world: World): WorldApproval {
  const approval = world.approvals[0];
  if (approval === undefined) throw new Error("The world has no approval.");
  return approval;
}

/** Serves `world` on `fake`, reading it afresh on every request. */
export function serveWorld(world: World, fake = new FakePaperclip()): FakePaperclip {
  const documents = `/api/issues/${pinnedIssue}/documents`;
  const routes: [string, () => unknown][] = [
    [`/api/companies/${company}/approvals`, () => world.approvals.map((each) => each.record)],
    [`${documents}/never-list`, () => world.neverList.document],
    [`${documents}/never-list/revisions`, () => world.neverList.revisions],
    [`${documents}/auto-approve-stop`, () => world.stop.document],
    [`${documents}/auto-approve-stop/revisions`, () => world.stop.revisions],
  ];
  for (const [path, body] of routes) fake.on("GET", path, () => ({ body: body() }));
  fake.on("GET", `/api/companies/${company}/activity`, ({ query }) => ({
    body: approvalNamed(world, query.get("entityId"))?.activity ?? [],
  }));
  const handle = fake.handle.bind(fake);
  fake.handle = async (request) => {
    const url = new URL(request.url);
    const override = world.overrides.get(`${request.method} ${url.pathname}`);
    if (override === undefined) {
      serveApprovals(world, fake);
      return withDate(await handle(request), world.serverTime);
    }
    const seen = { method: request.method, path: url.pathname, query: url.searchParams };
    fake.seen.push({ ...seen, headers: request.headers, body: undefined });
    return withDate(
      await override({ ...seen, headers: request.headers, body: undefined }),
      world.serverTime,
    );
  };
  return fake;
}

/** Each approval's own routes, as the world holds them now. */
function serveApprovals(world: World, fake: FakePaperclip): void {
  for (const approval of world.approvals) {
    const path = `/api/approvals/${String(approval.record["id"])}`;
    fake
      .on("GET", path, () => ({ body: approval.record }))
      .on("GET", `${path}/comments`, () => ({ body: approval.comments }))
      .on("GET", `${path}/issues`, () => ({ body: approval.issues }));
  }
}

function approvalNamed(world: World, id: string | null): WorldApproval | undefined {
  return world.approvals.find((each) => each.record["id"] === id);
}

function withDate(response: Response, serverTime: Date | undefined): Response {
  const headers = new Headers(response.headers);
  if (serverTime !== undefined) headers.set("date", serverTime.toUTCString());
  return new Response(response.body, { status: response.status, headers });
}

const digest = {
  sha256: async (data: Uint8Array) => new Uint8Array(createHash("sha256").update(data).digest()),
};

/** A ledger store in memory, which can be told to refuse every write (A43). */
export class MemoryLedgerStore implements LedgerStore {
  stored: LedgerEntry[] = [];
  refuseWrites = false;

  async last(): Promise<LedgerEntry | null> {
    return this.stored.at(-1) ?? null;
  }

  async append(entry: LedgerEntry): Promise<void> {
    if (this.refuseWrites) throw new Error("The disk is full.");
    this.stored.push(entry);
  }

  async entries(): Promise<readonly LedgerEntry[]> {
    return this.stored;
  }
}

/**
 * A shadow runner over `world`, through the real reader on a fake Paperclip. `wrap` may put a
 * fault between the reader and the runner (G2.4).
 */
export function runnerFor(
  world: World,
  store = new MemoryLedgerStore(),
  wrap: (reader: PaperclipShadowReader, fake: FakePaperclip) => ShadowSource = (reader) => reader,
) {
  const fake = serveWorld(world);
  const reader = new PaperclipShadowReader({
    address: fake.address,
    key: canaryKey,
    company,
    fetch: fake.fetch,
  });
  const runner = new ShadowRunner({
    source: wrap(reader, fake),
    store,
    digest,
    clock: { now: () => world.laptopTime },
    pins: {
      workspaceId: company,
      issueId: pinnedIssue,
      neverListDocumentId: neverListId,
      stopDocumentId: stopId,
      ownerUserIds: [owner],
    },
  });
  return { fake, reader, runner, store };
}

/** Every field of `expected` is in `actual`, with the same value. */
export function assertIncludes(actual: object, expected: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual((actual as Record<string, unknown>)[key], value, key);
  }
}

/** The reasons of the card entries, oldest first. */
export function cardReasons(store: MemoryLedgerStore): string[] {
  return store.stored.filter((entry) => entry.approvalId !== runEntryId).map((e) => e.reason);
}

/** The reasons of the run entries, oldest first. */
export function runReasons(store: MemoryLedgerStore): string[] {
  return store.stored.filter((entry) => entry.approvalId === runEntryId).map((e) => e.reason);
}
