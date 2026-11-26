/** The names the seed gives the throwaway Paperclip's records, which the steps look for. */
export const seedNames = {
  company: "Acme Click Test",
  agent: "Acme Clicky",
  task: "Acme: answer the click test",
  card: "Acme click-test card",
  cardType: "approve_ceo_strategy",
} as const;

/** The seeded records' ids. */
export interface Seeded {
  readonly companyId: string;
  readonly approvalId: string;
  readonly chatId: string;
}

/** What the steps read back from the throwaway Paperclip, past Studio, to check a click landed. */
export interface TestPaperclip {
  readonly seeded: Seeded;
  /** The seeded card's status, such as `pending` or `approved`. */
  approvalStatus(): Promise<string>;
  /** The bodies of the comments on the seeded chat. */
  chatComments(): Promise<readonly string[]>;
  /** Whether the key Studio signed in with still works; undefined when Studio sent none. */
  studioKeyWorks(): Promise<boolean | undefined>;
}

/**
 * Seeds the throwaway Paperclip at `target` (loopback, `local_trusted`, so no
 * key) with a company, a task, a board card on that task and a chat with an
 * agent. Agent Chat is an experimental setting, so the seed turns it on.
 */
export async function seedPaperclip(target: string): Promise<Seeded> {
  const call = api(target);
  await call("PATCH", "/api/instance/settings/experimental", { enableAgentChat: true });
  const company = await call("POST", "/api/companies", { name: seedNames.company });
  const companyId = idOf(company);
  const companyPath = `/api/companies/${companyId}`;
  await call("PATCH", companyPath, { requireBoardApprovalForNewAgents: false });
  // The agent never runs anything: a message wakes it, and its command only exits.
  const agent = await call("POST", `${companyPath}/agents`, {
    name: seedNames.agent,
    adapterType: "process",
    adapterConfig: { command: "cmd.exe", args: ["/c", "exit", "0"] },
  });
  const task = await call("POST", `${companyPath}/issues`, { title: seedNames.task });
  const approval = await call("POST", `${companyPath}/approvals`, {
    type: seedNames.cardType,
    payload: { title: seedNames.card, plan: seedNames.card },
    issueIds: [idOf(task)],
  });
  const chat = await call("POST", `${companyPath}/chats/${idOf(agent)}`);
  return { companyId, approvalId: idOf(approval), chatId: idOf(chat) };
}

/** The checks on the seeded records, with the key Studio last sent through the proxy. */
export function testPaperclip(
  target: string,
  seeded: Seeded,
  studioKey: () => string | undefined,
): TestPaperclip {
  const call = api(target);
  return {
    seeded,
    approvalStatus: async () => {
      const approval = await call("GET", `/api/approvals/${seeded.approvalId}`);
      return stringField(approval, "status");
    },
    chatComments: async () => {
      const comments = await call("GET", `/api/issues/${seeded.chatId}/comments`);
      return Array.isArray(comments) ? comments.map((comment) => stringField(comment, "body")) : [];
    },
    studioKeyWorks: async () => {
      const key = studioKey();
      if (key === undefined) return undefined;
      const answer = await fetch(`${target.replace(/\/$/, "")}/api/cli-auth/me`, {
        headers: { authorization: `Bearer ${key}` },
      });
      if (answer.status === 401) return false;
      if (!answer.ok) throw new Error(`GET /api/cli-auth/me: HTTP ${answer.status}`);
      return stringField(await answer.json(), "source") === "board_key";
    },
  };
}

type Call = (method: string, path: string, body?: unknown) => Promise<unknown>;

function api(target: string): Call {
  const base = target.replace(/\/$/, "");
  return async (method, path, body) => {
    const init: RequestInit = { method, headers: { "content-type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const answer = await fetch(`${base}${path}`, init);
    if (!answer.ok) {
      throw new Error(`${method} ${path}: HTTP ${answer.status} ${await answer.text()}`);
    }
    return answer.json();
  };
}

function idOf(record: unknown): string {
  return stringField(record, "id");
}

function stringField(record: unknown, key: string): string {
  const value =
    typeof record === "object" && record !== null ? Reflect.get(record, key) : undefined;
  if (typeof value !== "string") throw new Error(`the answer has no ${key}`);
  return value;
}
