/**
 * The whole list of requests the Paperclip provider may make
 * (`ports.paperclip-key`, ADR 2026-11-24 agent messaging). A board key can do
 * everything the board can, so the client sends nothing that isn't here. A
 * new entry needs a security review, and no entry may touch a route that
 * makes, lists or deletes keys or tokens (`/api/board-api-keys`, an agent's
 * keys, setup tokens, gateway tokens), because nothing goes to Paperclip
 * upstream and this list is the main protection (board, HAL-10, 24 Nov).
 *
 * The routes are Paperclip's as of our server's version; the README lists
 * what each answers.
 */
export const paperclipRequests = {
  listAgents: { method: "GET", path: "/api/companies/:company/agents" },
  listTasks: { method: "GET", path: "/api/companies/:company/issues" },
  listChats: { method: "GET", path: "/api/companies/:company/chats" },
  listProjects: { method: "GET", path: "/api/companies/:company/projects" },
  listComments: { method: "GET", path: "/api/issues/:task/comments" },
  listTaskCards: { method: "GET", path: "/api/issues/:task/interactions" },
  listApprovals: { method: "GET", path: "/api/companies/:company/approvals" },
  getApproval: { method: "GET", path: "/api/approvals/:approval" },
  listApprovalTasks: { method: "GET", path: "/api/approvals/:approval/issues" },
  commentOnChat: { method: "POST", path: "/api/issues/:task/comments" },
  acceptCard: { method: "POST", path: "/api/issues/:task/interactions/:card/accept" },
  rejectCard: { method: "POST", path: "/api/issues/:task/interactions/:card/reject" },
  respondToCard: { method: "POST", path: "/api/issues/:task/interactions/:card/respond" },
  approve: { method: "POST", path: "/api/approvals/:approval/approve" },
  rejectApproval: { method: "POST", path: "/api/approvals/:approval/reject" },
  // Disconnect (track A4): read who the key belongs to, and revoke the key in use.
  // Starting a sign-in makes a key, so it isn't here: no route that makes keys is
  // (board, HAL-10, 24 Nov). A4 brings sign-in with its own security review.
  whoAmI: { method: "GET", path: "/api/cli-auth/me" },
  revokeKey: { method: "POST", path: "/api/cli-auth/revoke-current" },
} as const satisfies Record<string, { method: "GET" | "POST"; path: string }>;

/** The name of one request on {@link paperclipRequests}. */
export type PaperclipRequestName = keyof typeof paperclipRequests;

/** Values for the `:name` segments of a request's path, such as `{ company: "…" }`. */
export type PathValues = Readonly<Record<string, string>>;

/** Thrown before any request is made, when an ID can't be one path segment. */
export class UnsafeIdError extends Error {
  constructor(segment: string) {
    // The value itself stays out: it came from an app or an answer.
    super(`The ID for :${segment} can't be sent to Paperclip.`);
    this.name = "UnsafeIdError";
  }
}

/**
 * Whether `value` can be one path segment: not empty, no `/` or `\`, not
 * `.` or `..`, and no control characters. Paperclip's IDs are UUIDs, so
 * anything else is refused rather than escaped into something the server
 * might decode again.
 */
export function isSafeSegment(value: string): boolean {
  if (value === "" || value === "." || value === "..") {
    return false;
  }
  return /^[A-Za-z0-9._~-]+$/.test(value);
}

/**
 * The path of request `name` with `values` filled in, each one checked to
 * be one segment. Throws {@link UnsafeIdError} for an unsafe or missing value.
 */
export function buildPath(name: PaperclipRequestName, values: PathValues): string {
  const pattern = paperclipRequests[name].path;
  return pattern
    .split("/")
    .map((part) => {
      if (!part.startsWith(":")) {
        return part;
      }
      const segment = part.slice(1);
      const value = values[segment];
      if (value === undefined || !isSafeSegment(value)) {
        throw new UnsafeIdError(segment);
      }
      return encodeURIComponent(value);
    })
    .join("/");
}

/**
 * The request on the list that `method` and `path` match, or `undefined`.
 * Tests use it to check that every request a fake server saw was allowed.
 */
export function findRequest(method: string, path: string): PaperclipRequestName | undefined {
  const parts = path.split("/");
  const names = Object.keys(paperclipRequests) as PaperclipRequestName[];
  return names.find((name) => {
    const request = paperclipRequests[name];
    const patternParts = request.path.split("/");
    if (request.method !== method || patternParts.length !== parts.length) {
      return false;
    }
    return patternParts.every((patternPart, index) => {
      const part = parts[index] ?? "";
      return patternPart.startsWith(":") ? isSafeSegment(part) : patternPart === part;
    });
  });
}
