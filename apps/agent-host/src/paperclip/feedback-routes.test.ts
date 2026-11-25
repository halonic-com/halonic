import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readConnectionFile } from "../messaging/connection-file.ts";
import { paperclipFeedback } from "../messaging/paperclip-provider.ts";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { feedbackMaxBodyBytes, feedbackRoutes } from "./feedback-routes.ts";

// A fake key only these tests use, so its absence from answers and logs means something.
const fakeKey = "pcp_board_fake-key-for-tests-only";
const acme = { address: "https://paperclip.acme.test", company: "acme-company" };
const madeTask = "task-77";
/** What the fake Paperclip says when it refuses: it must reach neither the page nor the log. */
const paperclipWords = "Acme's Paperclip says no: quota for project website reached";

/** A tiny made-up PNG: the signature and a few bytes after it. */
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/** A Paperclip stand-in on Acme's address: one project, one agent, and the task it makes. */
class FakePaperclip {
  readonly seen: string[] = [];
  /** The task Paperclip made, if any. */
  made: Record<string, unknown> | undefined;
  /** The files attached to it, by name, with their bytes. */
  readonly attached = new Map<string, Uint8Array>();
  offline = false;
  refuseTasks = false;

  readonly fetch = async (input: Request | string | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (this.offline) throw new TypeError("fetch failed");
    const path = new URL(request.url).pathname;
    this.seen.push(`${request.method} ${path}`);
    const companyPath = `/api/companies/${acme.company}`;
    if (path === `${companyPath}/projects`) return json([{ id: "project-1", name: "Website" }]);
    if (path === `${companyPath}/agents`) return json([{ id: "agent-ada", name: "Ada" }]);
    if (path === `${companyPath}/issues` && request.method === "POST") {
      if (this.refuseTasks) return json({ error: paperclipWords }, 422);
      this.made = (await request.json()) as Record<string, unknown>;
      return json({ id: madeTask, identifier: "ACME-42" }, 201);
    }
    if (path === `/api/issues/${madeTask}/attachments`) {
      return json([...this.attached.keys()].map((name) => ({ originalFilename: name })));
    }
    if (path === `${companyPath}/issues/${madeTask}/attachments`) {
      const file = (await request.formData()).get("file");
      if (file instanceof File) this.attached.set(file.name, new Uint8Array(await file.bytes()));
      return json({ id: "attachment-1" }, 201);
    }
    return json({ error: "API route not found" }, 404);
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface Setup {
  url: string;
  token: string;
  workspace: string;
  keys: PaperclipKeys;
  paperclip: FakePaperclip;
  logged: string[];
  close(): Promise<void>;
}

let setup: Setup;

beforeEach(async () => {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), "acme-feedback-")));
  await mkdir(join(workspace, "connections", "paperclip"), { recursive: true });
  await writeFile(
    join(workspace, "connections", "paperclip", "halonic.yaml"),
    `label: Halonic\naddress: ${acme.address}\ncompany: ${acme.company}\n`,
  );
  const keys = new PaperclipKeys();
  const paperclip = new FakePaperclip();
  const logged: string[] = [];
  const token = randomLaunchToken();
  const server: HostServer = await startHostServer(
    token,
    feedbackRoutes({
      workspaceRoots: [workspace],
      senderFor: (binding) =>
        paperclipFeedback({
          binding,
          keys,
          readNow: () => readConnectionFile(binding.workspace, binding.connection),
          fetch: paperclip.fetch,
        }),
      log: (text) => logged.push(text),
    }),
  );
  setup = {
    url: server.url,
    token,
    workspace,
    keys,
    paperclip,
    logged,
    close: async () => {
      await server.close();
      await rm(workspace, { recursive: true, force: true });
    },
  };
});

afterEach(async () => {
  await setup.close();
});

/** Studio connects `halonic` in the workspace: the host now holds its key. */
function connect(): void {
  setup.keys.replace(
    { workspace: setup.workspace, connection: "halonic" },
    { key: fakeKey, ...acme },
  );
}

/** A feedback for Ada in Website, with the PNG, as the page sends it; `fields` replace any part. */
function feedback(fields: object = {}): object {
  return {
    workspace: setup.workspace,
    connection: "halonic",
    id: "feedback-1",
    title: "The Runs list jumps",
    description: "The Runs list jumps when a run ends.",
    project: "Website",
    assignee: "Ada",
    screenshot: {
      fileName: "feedback-2026-11-25T18-04-05.png",
      contentType: "image/png",
      base64: Buffer.from(png).toString("base64"),
    },
    ...fields,
  };
}

/** Posts `body` as it is, with the launch token unless `token` says otherwise. */
async function post(body: string, token: string | null = setup.token) {
  const response = await fetch(`${setup.url}/v1/paperclip/feedback`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body,
  });
  const text = await response.text();
  return { status: response.status, text, body: JSON.parse(text) as unknown };
}

const send = (fields: object = {}) => post(JSON.stringify(feedback(fields)));

verifies("agent-host.feedback-send-route", () => {
  describe("POST /v1/paperclip/feedback", () => {
    it("makes the task for Ada in Website with the PNG attached, and answers sent", async () => {
      connect();

      const answer = await send();

      expect(answer).toMatchObject({
        status: 200,
        body: { outcome: "sent", taskUrl: "https://paperclip.acme.test/ACME/issues/ACME-42" },
      });
      expect(setup.paperclip.made).toMatchObject({
        title: "The Runs list jumps",
        projectId: "project-1",
        assigneeAgentId: "agent-ada",
        status: "todo",
      });
      expect(setup.paperclip.attached.get("feedback-2026-11-25T18-04-05.png")).toEqual(png);
      expect(answer.text).not.toContain(fakeKey);
    });

    it("sends a feedback without a screenshot, with no attachment", async () => {
      connect();

      const answer = await send({ screenshot: undefined });

      expect(answer.body).toMatchObject({ outcome: "sent" });
      expect(setup.paperclip.attached.size).toBe(0);
    });

    it("answers refused with none of Paperclip's words, and logs none of them", async () => {
      connect();
      setup.paperclip.refuseTasks = true;

      const answer = await send();

      expect(answer).toEqual({ status: 200, text: answer.text, body: { outcome: "refused" } });
      expect(answer.text).not.toContain("quota");
      expect(setup.logged.join("")).not.toContain("quota");
    });

    it("answers refused, not Paperclip's words, for a project Paperclip doesn't have", async () => {
      connect();

      const answer = await send({ project: "Moon base" });

      expect(answer.body).toEqual({ outcome: "refused" });
      expect(answer.text).not.toContain("Moon base");
    });

    it("answers offline when Paperclip can't be reached", async () => {
      connect();
      setup.paperclip.offline = true;

      expect((await send()).body).toEqual({ outcome: "offline" });
    });

    it("answers not-connected, and calls nobody, when the host holds no key", async () => {
      expect((await send()).body).toEqual({ outcome: "not-connected" });
      expect(setup.paperclip.seen).toEqual([]);
    });

    it("refuses a body over 10 MB before reading it as JSON", async () => {
      connect();
      // Not JSON at all: a 400 body_not_json would mean the host had read it.
      const answer = await post("x".repeat(feedbackMaxBodyBytes + 1));

      expect(answer.status).toBe(413);
      expect(answer.body).toMatchObject({ error: { kind: "body_too_large" } });
      expect(setup.paperclip.seen).toEqual([]);
    });

    it("refuses a request without the launch token, or with another one, and sends nothing", async () => {
      connect();
      const body = JSON.stringify(feedback());

      expect((await post(body, null)).status).toBe(401);
      expect((await post(body, randomLaunchToken())).status).toBe(401);
      expect(setup.paperclip.seen).toEqual([]);
    });

    it("refuses a title over 80 characters, a screenshot that isn't a PNG and an unknown field", async () => {
      connect();
      const gif = Buffer.from("GIF89a-not-a-png").toString("base64");
      const notPng = { ...(feedback() as { screenshot: object }).screenshot, base64: gif };

      for (const fields of [
        { title: "t".repeat(81) },
        { screenshot: notPng },
        { screenshot: { fileName: "shot.gif", contentType: "image/gif", base64: gif } },
        { key: fakeKey },
        { project: "" },
      ]) {
        const answer = await send(fields);
        expect(answer.status).toBe(400);
        expect(answer.body).toMatchObject({ error: { kind: "body_invalid" } });
      }
      expect(setup.paperclip.seen).toEqual([]);
    });

    it("refuses a folder that isn't a workspace the launcher named", async () => {
      connect();

      const answer = await send({ workspace: tmpdir() });

      expect(answer.status).toBe(404);
      expect(setup.paperclip.seen).toEqual([]);
    });
  });
});
