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
  // Item verdicts (`paperclip-client.card-kinds`, HAL-18871): approve, reject or defer a card's items.
  submitVerdicts: { method: "POST", path: "/api/issues/:task/interactions/:card/verdicts" },
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
  // Workflow task writes (`paperclip-client.task-writes`, HAL-17975): a routine wakes an
  // agent or closes a task, each with a comment. Both use Paperclip's task update, so
  // each row also pins its body: exactly these fields, and this one status.
  getTask: { method: "GET", path: "/api/issues/:task" },
  wakeTask: {
    method: "PATCH",
    path: "/api/issues/:task",
    body: { fields: ["assigneeAgentId", "status", "comment"], status: "todo" },
  },
  finishTask: {
    method: "PATCH",
    path: "/api/issues/:task",
    body: { fields: ["status", "comment"], status: "done" },
  },
  // Stepper requests (`paperclip-client.stepper-requests`, HAL-17536): each row names its one
  // document key in the path, so the key reads or writes no other document, `plan` included.
  // The result's summary comment goes through commentOnChat's route, the task's comments.
  readStepperRequest: {
    method: "GET",
    path: "/api/issues/:task/documents/stepper-request/revisions/:revision",
  },
  latestStepperRequest: { method: "GET", path: "/api/issues/:task/documents/stepper-request" },
  writeStepperResult: {
    method: "PUT",
    path: "/api/issues/:task/documents/stepper-result",
    body: {
      fields: ["title", "format", "body", "baseRevisionId"],
      pinned: { title: "Stepper result", format: "markdown" },
      nullable: ["baseRevisionId"],
    },
  },
  // Channels (`paperclip-client.channels`, K1, HAL-17637): the person's message is a comment
  // on the channel's parent task, and each agent it is addressed to gets one child task,
  // assigned to that agent, because in Paperclip only an assignment wakes an agent. The
  // create row pins its body, so it sets no project, label, blocker or budget, and only `todo`.
  commentOnChannel: { method: "POST", path: "/api/issues/:task/comments" },
  createChildTask: {
    method: "POST",
    path: "/api/companies/:company/issues",
    body: {
      fields: ["title", "description", "parentId", "assigneeAgentId", "status"],
      status: "todo",
    },
  },
  // Starting a channel and its members (`paperclip-client.channel-membership`, HAL-18121). The
  // parent is made with the channel tag, unassigned and in `backlog`, so a comment on it wakes
  // no agent. Paperclip has no followers on a task, so who follows a channel is kept in its
  // members line, and every change rewrites only the parent's description. The label row can
  // make only the `channel` tag. Nothing here adds, hires or changes an agent.
  listLabels: { method: "GET", path: "/api/companies/:company/labels" },
  createChannelLabel: {
    method: "POST",
    path: "/api/companies/:company/labels",
    body: { fields: ["name", "color"], pinned: { name: "channel", color: "#6366f1" } },
  },
  createChannel: {
    method: "POST",
    path: "/api/companies/:company/issues",
    body: {
      fields: ["title", "description", "labelIds", "status"],
      status: "backlog",
      idLists: ["labelIds"],
    },
  },
  updateChannel: {
    method: "PATCH",
    path: "/api/issues/:task",
    body: { fields: ["description"] },
  },
  // Channel work lines (HAL-18120): a child task's history, read for its hand-offs. The child
  // tasks themselves come from listTasks with `parentId=`, and replies from listComments.
  listTaskActivity: { method: "GET", path: "/api/issues/:task/activity" },
  // Full answers (`paperclip-client.full-answers`, HAL-18756): a chat task's `full-answer`
  // document, read only when an agent's reply on that chat links it. Like the stepper rows, the
  // row names its one key in the path, so it reads no other document, `plan` included.
  readFullAnswer: { method: "GET", path: "/api/issues/:task/documents/full-answer" },
  // Agents' pictures (HAL-18485): the one read that isn't JSON. The answer must be a PNG, JPEG or
  // WebP picture of at most 256 KB (`avatars.ts`); anything else is refused, its body unread.
  readAgentAvatar: { method: "GET", path: "/api/agent-avatars/:avatar" },
  // Runs (`paperclip-client.team-runs`, HAL-18650): reads only. The live runs, and the newest
  // finished ones (`agentId=` and `limit=` only). The answers carry logs and wake text; the mapping
  // keeps none of it. Stopping a run is a separate row with its own review (HAL-18624 PR 3).
  listLiveRuns: { method: "GET", path: "/api/companies/:company/live-runs" },
  listRuns: { method: "GET", path: "/api/companies/:company/heartbeat-runs" },
  // Run control (`paperclip-client.team-run-control`, HAL-18695): one run, read again before each
  // write for its company, agent, task and `canStop` only (its logs and errors are never kept), and
  // its cancel, which takes no body. Run again wakes the agent through `wakeTask` above.
  getRun: { method: "GET", path: "/api/heartbeat-runs/:run" },
  cancelRun: { method: "POST", path: "/api/heartbeat-runs/:run/cancel" },
  // Screenshot feedback (`paperclip-client.feedback-tasks`, HAL-18737): one task in a project,
  // assigned to one agent, with an idempotency key, so a retry after a lost reply gets the same
  // task back. The create row sets no parent, label, blocker or budget, only `todo`, and its key
  // must be a feedback's, so it can't make any other task. The upload row takes one PNG and
  // nothing else; the list row lets a retry see that the PNG is already there.
  createFeedbackTask: {
    method: "POST",
    path: "/api/companies/:company/issues",
    body: {
      fields: ["title", "description", "projectId", "assigneeAgentId", "status", "idempotencyKey"],
      status: "todo",
      prefixed: { idempotencyKey: "halonic-feedback:" },
    },
  },
  listTaskAttachments: { method: "GET", path: "/api/issues/:task/attachments" },
  attachScreenshot: {
    method: "POST",
    path: "/api/companies/:company/issues/:task/attachments",
    upload: { field: "file", contentType: "image/png", maxBytes: 10 * 1024 * 1024 },
  },
  // Read receipts (`paperclip-client.read-receipts`, HAL-18772): a chat task's runs, read for
  // each run's agent, status, start and the comments that woke it. The answer carries logs, errors
  // and wake text; the mapping keeps none of it.
  listIssueRuns: { method: "GET", path: "/api/issues/:task/runs" },
} as const satisfies Record<string, RequestRule>;

/**
 * What a write's body must be: an object with exactly `fields`, every field
 * a non-empty string (or `null` for one listed in `nullable`, or a list of
 * exactly one safe ID for one listed in `idLists`), its `status` field set to
 * `status` and each `pinned` field set to its value.
 */
interface BodyRule {
  fields: readonly string[];
  status?: string;
  pinned?: Readonly<Record<string, string>>;
  nullable?: readonly string[];
  idLists?: readonly string[];
  /** Fields whose text must start with the given prefix and go on after it. */
  prefixed?: Readonly<Record<string, string>>;
}

/**
 * One row of the fixed list. A row sends a JSON body, a file, or neither, never both: the
 * `never` members make a row with both a type error.
 */
type RequestRule = {
  method: "GET" | "POST" | "PATCH" | "PUT";
  path: string;
} & (
  | {
      /** For a write on a route that takes many fields: the only body it may send. */
      body?: BodyRule;
      upload?: never;
    }
  | {
      /** For a file upload: the one file it may send, as multipart form data. */
      upload: UploadRule;
      body?: never;
    }
);

/** What a row's one uploaded file must be: in form field `field`, of this type, at most `maxBytes`. */
export interface UploadRule {
  field: string;
  contentType: "image/png";
  maxBytes: number;
}

/**
 * Segments that must be more than one safe segment: a pull request number
 * is a positive integer of at most 9 digits, as the plugin route requires.
 */
const segmentRules: Readonly<Record<string, RegExp>> = {
  number: /^[1-9]\d{0,8}$/,
  // A document revision is a UUID, as Paperclip makes them.
  revision: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  // A run is a UUID too: Paperclip's run routes refuse anything else.
  run: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
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
 * Whether `body` may go with request `name`: anything for a row without a
 * body rule, otherwise exactly the rule's fields, each a non-empty string or
 * a `null` the rule allows, with the rule's status, pinned values and prefixes. So a
 * task write can't change a title, a blocker or a budget, or set any other
 * status, and the stepper result is always a Markdown document of that title.
 */
export function fitsBody(name: PaperclipRequestName, body: unknown): boolean {
  const rule: BodyRule | undefined = (paperclipRequests[name] as RequestRule).body;
  if (rule === undefined) {
    return true;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return false;
  }
  const fields = new Map<string, unknown>(Object.entries(body));
  const onlyRuleFields =
    fields.size === rule.fields.length && rule.fields.every((field) => fields.has(field));
  const allText = [...fields].every(([field, value]) =>
    rule.idLists?.includes(field) === true
      ? isOneIdList(value)
      : (typeof value === "string" && value !== "") ||
        (value === null && rule.nullable?.includes(field) === true),
  );
  const allPrefixed = Object.entries(rule.prefixed ?? {}).every(([field, prefix]) => {
    const value = fields.get(field);
    return typeof value === "string" && value.startsWith(prefix) && value.length > prefix.length;
  });
  const pinned = Object.entries({
    ...(rule.status === undefined ? {} : { status: rule.status }),
    ...rule.pinned,
  });
  return (
    onlyRuleFields &&
    allText &&
    allPrefixed &&
    pinned.every(([field, value]) => fields.get(field) === value)
  );
}

/** Row `name`'s upload rule, or `undefined` for a row that sends no file. */
export function uploadRule(name: PaperclipRequestName): UploadRule | undefined {
  return (paperclipRequests[name] as RequestRule).upload;
}

/** Whether `value` is a list of exactly one ID that is a safe segment, such as one label. */
function isOneIdList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === "string" &&
    isSafeSegment(value[0])
  );
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
