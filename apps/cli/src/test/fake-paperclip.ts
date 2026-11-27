import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { paperclipKeySecretName } from "../commands/serve/serve-messaging.ts";

// A canary key only these tests use, so its absence from answers, logs and files means something.
export const canaryKey = "pcp_board_canary-key-for-serve-tests-only";
export const acme = { address: "https://paperclip.acme.test", company: "acme-company" };

/** The agent-tools plugin's last PR watcher pass, as the fake serves it: #12 has red checks. */
export const watcherPass = {
  at: "2026-11-10T14:00:00.000Z",
  input: { prs: [{ number: 12, task: "task-7", author: "agent-ada", checks: "red" }] },
  actions: [],
};

/** The plugin route that serves {@link watcherPass}. */
export const watcherPassPath = "/api/plugins/halonic.agent-tools/api/pr-watcher/pass";

/** Ada's task with PR #12, which the routine's tool steps read and write. */
export const watchedTask = "/api/issues/task-7";

/** One request the fake Paperclip saw. */
export interface SeenRequest {
  url: string;
  method: string;
  authorization: string | null;
  /** The JSON a write sent, if any. */
  body?: unknown;
}

/**
 * A Paperclip stand-in on Acme's address: two agents and a chat with Ada. It is offline when
 * the test says so, and with `failing` it answers 500 with the request's own key in the body,
 * as a careless proxy would.
 */
export class FakePaperclip {
  readonly seen: SeenRequest[] = [];
  offline = false;
  failing = false;

  readonly fetch = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    if (this.offline) throw new TypeError("fetch failed");
    const authorization = request.headers.get("authorization");
    const body = await jsonOf(request);
    this.seen.push({
      url: request.url,
      method: request.method,
      authorization,
      ...(body === undefined ? {} : { body }),
    });
    if (this.failing) return json({ error: `bad key ${authorization}` }, 500);
    const path = new URL(request.url).pathname;
    if (path === `/api/companies/${acme.company}/agents`) {
      return json([
        { id: "agent-ada", name: "Ada", title: "CTO", status: "running" },
        { id: "agent-bo", name: "Bo", status: "paused" },
      ]);
    }
    if (path === `/api/companies/${acme.company}/chats`) {
      return json([
        {
          id: "task-1",
          title: "Chat with Ada",
          conversationAgentId: "agent-ada",
          conversationState: "waiting",
          updatedAt: "2026-11-24T13:55:00.000Z",
        },
      ]);
    }
    if (path === `/api/companies/${acme.company}/issues`) return json([]);
    if (path === `/api/companies/${acme.company}/approvals`) return json([]);
    if (path === `/api/companies/${acme.company}/decisions`) return json([]);
    if (path === `/api/companies/${acme.company}/secret-proposals`) return json([]);
    if (path === `/api/companies/${acme.company}/join-requests`) return json([]);
    if (path === `/api/companies/${acme.company}/projects`) return json([]);
    if (path === "/api/issues/task-1/comments") return json([]);
    // The Inbox reads the chat's cards too, as the task list leaves chats out.
    if (path === "/api/issues/task-1/interactions") return json([]);
    return toolStepAnswer(path, request.method, body);
  };
}

/** The answers to a served routine's tool steps: the pass, and the watched task's read and update. */
function toolStepAnswer(path: string, method: string, body: unknown): Response {
  if (path === watcherPassPath) return json(watcherPass);
  if (path === watchedTask) {
    const task = { id: "task-7", companyId: acme.company, status: "in_progress" };
    return json(method === "PATCH" ? { ...task, ...(body as object) } : task);
  }
  return json({ error: "API route not found" }, 404);
}

/** The JSON a request sent, or `undefined` for none. */
async function jsonOf(request: Request): Promise<unknown> {
  const sent = request.method === "GET" ? "" : await request.text();
  return sent === "" ? undefined : JSON.parse(sent);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Writes `connections/paperclip/<name>.yaml` in `workspace`, as Connect writes it. */
export async function writeConnection(
  workspace: string,
  name: string,
  file: { label: string; address: string; company: string },
): Promise<void> {
  const folder = join(workspace, "connections", "paperclip");
  await mkdir(folder, { recursive: true });
  const text = [
    `label: ${JSON.stringify(file.label)}`,
    `address: ${JSON.stringify(file.address)}`,
    `company: ${JSON.stringify(file.company)}`,
    "",
  ].join("\n");
  await writeFile(join(folder, `${name}.yaml`), text);
}

/** The stored record for `connection`, under its reserved name, as the server's sign-in keeps it. */
export function storedRecord(
  connection: string,
  record = { key: canaryKey, ...acme },
): Record<string, string> {
  return { [paperclipKeySecretName(connection)]: JSON.stringify(record) };
}
