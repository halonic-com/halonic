import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { paperclipKeySecretName } from "../commands/serve/serve-messaging.ts";

// A canary key only these tests use, so its absence from answers, logs and files means something.
export const canaryKey = "pcp_board_canary-key-for-serve-tests-only";
export const acme = { address: "https://paperclip.acme.test", company: "acme-company" };

/** One request the fake Paperclip saw. */
export interface SeenRequest {
  url: string;
  method: string;
  authorization: string | null;
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
    this.seen.push({ url: request.url, method: request.method, authorization });
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
    return json({ error: "API route not found" }, 404);
  };
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
