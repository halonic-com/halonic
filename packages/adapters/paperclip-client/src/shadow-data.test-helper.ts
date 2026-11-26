import { approvalId, company, testKey } from "./acme-data.test-helper.ts";
import type { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { buildPath, type PaperclipRequestName, paperclipRequests } from "./requests.ts";
import { PaperclipShadowReader } from "./shadow-reads.ts";

/** The made-up pinned never-list issue and its two documents. */
export const pinnedIssue = "i0000000-0000-4000-8000-0000000000a1";
export const neverListDocument = "d0000000-0000-4000-8000-0000000000a1";
export const stopDocument = "d0000000-0000-4000-8000-0000000000a2";

/** The board connection Studio reads with: in shadow mode, the owner who writes both documents. */
export const boardConnection = "u0000000-0000-4000-8000-0000000000b1";

const createdAt = "2026-11-26T10:00:00.000Z";

/** A pending approval, as Paperclip's approvals routes give it. */
export function pendingApproval(extra: Record<string, unknown> = {}) {
  return {
    id: approvalId,
    companyId: company,
    type: "request_board_approval",
    status: "pending",
    requestedByAgentId: "a0000000-0000-4000-8000-000000000001",
    decidedByUserId: null,
    payload: { summary: "Publish the docs page" },
    createdAt,
    updatedAt: createdAt,
    ...extra,
  };
}

/** A pinned document and its one revision, written by the board connection. */
export function pinnedDocument(id: string, key: string, body: string) {
  const revision = {
    id: `${id.slice(0, -2)}r1`,
    companyId: company,
    documentId: id,
    issueId: pinnedIssue,
    key,
    revisionNumber: 1,
    body,
    createdByAgentId: null,
    createdByUserId: boardConnection,
    createdAt,
  };
  const document = {
    id,
    companyId: company,
    issueId: pinnedIssue,
    key,
    latestRevisionId: revision.id,
    lockedAt: createdAt,
    body,
  };
  return { document, revisions: [revision] };
}

const neverListText = `version: 2\nworkspaceId: ${company}\nentries: []\n`;

/** Serves every shadow row from made-up data. */
export function serveShadow(fake: FakePaperclip): FakePaperclip {
  const neverList = pinnedDocument(neverListDocument, "never-list", neverListText);
  const stop = pinnedDocument(stopDocument, "auto-approve-stop", "stop: false\n");
  const documents = `/api/issues/${pinnedIssue}/documents`;
  return fake
    .on("GET", `/api/companies/${company}/approvals`, { body: [pendingApproval()] })
    .on("GET", `/api/approvals/${approvalId}`, { body: pendingApproval() })
    .on("GET", `/api/companies/${company}/activity`, {
      body: [
        {
          companyId: company,
          entityType: "approval",
          entityId: approvalId,
          action: "approval.created",
          actorType: "agent",
          actorId: "a0000000-0000-4000-8000-000000000001",
          createdAt,
        },
      ],
    })
    .on("GET", `/api/approvals/${approvalId}/comments`, { body: [] })
    .on("GET", `/api/approvals/${approvalId}/issues`, {
      body: [{ id: pinnedIssue, companyId: company, title: "Docs page", description: null }],
    })
    .on("GET", `${documents}/never-list`, { body: neverList.document })
    .on("GET", `${documents}/never-list/revisions`, { body: neverList.revisions })
    .on("GET", `${documents}/auto-approve-stop`, { body: stop.document })
    .on("GET", `${documents}/auto-approve-stop/revisions`, { body: stop.revisions });
}

/** A shadow reader on `fake`'s address, with `fetchFunction` or the platform's own `fetch`. */
export function shadowReader(fake: FakePaperclip, fetchFunction?: typeof fetch) {
  return new PaperclipShadowReader({
    address: fake.address,
    key: testKey,
    company,
    ...(fetchFunction === undefined ? {} : { fetch: fetchFunction }),
  });
}

/** Every public read of the shadow reader, once. */
export async function readEverything(reader: PaperclipShadowReader): Promise<void> {
  await reader.pendingApprovals();
  await reader.approval(approvalId);
  await reader.pinnedDocuments(pinnedIssue);
}

/** Every row on the fixed list, as `[name, method, path]`, each `:segment` filled with a valid ID. */
export function everyRow(): [PaperclipRequestName, string, string][] {
  return Object.entries(paperclipRequests).map(([name, row]) => {
    const values = Object.fromEntries(
      row.path
        .split("/")
        .filter((part) => part.startsWith(":"))
        .map((part) => [
          part.slice(1),
          part === ":number" ? "1" : "e0000000-0000-4000-8000-000000000001",
        ]),
    );
    return [
      name as PaperclipRequestName,
      row.method,
      buildPath(name as PaperclipRequestName, values),
    ];
  });
}
