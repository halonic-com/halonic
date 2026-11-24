/**
 * The whole list of requests the Paperclip provider may make
 * (`agent-host.paperclip-key`, ADR 2026-11-24 agent messaging). A board key can do
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
  // Search (HAL-17501): the same route with `q=`, so it reads nothing listTasks can't.
  searchTasks: { method: "GET", path: "/api/companies/:company/issues" },
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
  // (board, HAL-10, 24 Nov). Sign-in has its own list, `sign-in-requests.ts` (HAL-17439).
  whoAmI: { method: "GET", path: "/api/cli-auth/me" },
  revokeKey: { method: "POST", path: "/api/cli-auth/revoke-current" },
  // TeamStatus (`paperclip-client.team-status`, HAL-17606): reads only. The plugin row
  // is pinned to the plugin's id and route, so the key reaches no other plugin route.
  spendSummary: { method: "GET", path: "/api/companies/:company/costs/summary" },
  spendByProvider: { method: "GET", path: "/api/companies/:company/costs/by-provider" },
  spendByAgent: { method: "GET", path: "/api/companies/:company/costs/by-agent" },
  spendByAgentModel: { method: "GET", path: "/api/companies/:company/costs/by-agent-model" },
  budgetsOverview: { method: "GET", path: "/api/companies/:company/budgets/overview" },
  seatsSummary: { method: "GET", path: "/api/plugins/halonic.seats/api/seats/summary" },
  // Pull requests and the merge queue (`paperclip-client.team-pull-requests`, HAL-17681),
  // from the agent-tools plugin's stored snapshot: the GitHub token stays with the plugin.
  pullRequestsSummary: {
    method: "GET",
    path: "/api/plugins/halonic.agent-tools/api/github/summary",
  },
  pullRequestDetail: {
    method: "GET",
    path: "/api/plugins/halonic.agent-tools/api/github/pr/:number",
  },
} as const satisfies Record<string, { method: "GET" | "POST"; path: string }>;

/**
 * Segments that must be more than one safe segment: a pull request number
 * is a positive integer of at most 9 digits, as the plugin route requires.
 */
const segmentRules: Readonly<Record<string, RegExp>> = {
  number: /^[1-9]\d{0,8}$/,
};

/** Whether `value` may fill segment `:segment`: safe, and passing the segment's own rule. */
export function fitsSegment(segment: string, value: string): boolean {
  const rule = segmentRules[segment];
  return isSafeSegment(value) && (rule === undefined || rule.test(value));
}

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
      if (value === undefined || !fitsSegment(segment, value)) {
        throw new UnsafeIdError(segment);
      }
      return encodeURIComponent(value);
    })
    .join("/");
}

/** Whether `method` and `path` are request `name`'s, each `:name` segment a safe one. */
export function matchesRequest(name: PaperclipRequestName, method: string, path: string): boolean {
  const request = paperclipRequests[name];
  const parts = path.split("/");
  const patternParts = request.path.split("/");
  if (request.method !== method || patternParts.length !== parts.length) {
    return false;
  }
  return patternParts.every((patternPart, index) => {
    const part = parts[index] ?? "";
    return patternPart.startsWith(":")
      ? fitsSegment(patternPart.slice(1), part)
      : patternPart === part;
  });
}

/**
 * The first request on the list that `method` and `path` match, or
 * `undefined`. Tests use it to check that every request a fake server saw
 * was allowed.
 */
export function findRequest(method: string, path: string): PaperclipRequestName | undefined {
  const names = Object.keys(paperclipRequests) as PaperclipRequestName[];
  return names.find((name) => matchesRequest(name, method, path));
}
