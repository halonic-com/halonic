import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { hostModelRoutes } from "./host-model-routes.ts";
import { modelRoutes } from "./model-routes.ts";

export const token = randomLaunchToken();

/** A model server on this computer that copies OpenAI's API, and what it was asked. */
export interface FakeModelServer {
  url: string;
  /** The JSON bodies it was asked with. */
  asked: unknown[];
  /** The `Authorization` headers it saw. */
  authorizations: (string | undefined)[];
  /** The status and body it answers next, instead of a good answer. */
  failWith: { status: number; body: string } | undefined;
  /** While set, it answers only after this settles, so a test can keep chats running. */
  holding: Promise<void> | undefined;
  /** How many of its answers the caller left before they were sent. */
  dropped: number;
  close(): Promise<void>;
}

async function fakeModelServer(): Promise<FakeModelServer> {
  const fake: FakeModelServer = {
    url: "",
    asked: [],
    authorizations: [],
    failWith: undefined,
    holding: undefined,
    dropped: 0,
    close: async () => undefined,
  };
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.on("close", () => {
      if (!response.writableFinished) fake.dropped += 1;
    });
    request.on("end", async () => {
      fake.asked.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      fake.authorizations.push(request.headers.authorization);
      await fake.holding;
      if (fake.failWith !== undefined) {
        response.writeHead(fake.failWith.status, { "content-type": "application/json" });
        response.end(fake.failWith.body);
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion",
          model: "llama-test",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "A short summary." },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  fake.close = () => new Promise((resolve) => server.close(() => resolve()));
  return fake;
}

export interface Setup {
  url: string;
  model: FakeModelServer;
  /** The workspace the launcher named, another folder it didn't, and the folder holding both. */
  folders: { base: string; workspace: string; other: string };
  /** What the host wrote to its own log. */
  logged: string[];
  /** Writes a provider file into the named workspace. */
  provider(id: string, fields: Record<string, string>, folder?: string): Promise<void>;
  link(target: string): Promise<string>;
  close(): Promise<void>;
}

/** Starts the real model route (the host's own wiring) over real folders and a fake model server. */
export async function startRoutes(
  env: Record<string, string> = {},
  maxChats?: number,
): Promise<Setup> {
  const base = await realpath(await mkdtemp(join(tmpdir(), "agent-host-model-")));
  const folders = { base, workspace: join(base, "workspace"), other: join(base, "other") };
  await mkdir(folders.workspace);
  await mkdir(folders.other);
  const model = await fakeModelServer();
  const logged: string[] = [];
  const ownPorts = new Set<number>();
  const routes = modelRoutes({
    ...hostModelRoutes({
      workspaceRoots: [folders.workspace],
      profile: undefined,
      env,
      ownPorts: () => ownPorts,
      log: (text) => logged.push(text),
    }),
    ...(maxChats === undefined ? {} : { maxChats }),
  });
  const server: HostServer = await startHostServer(token, routes);
  ownPorts.add(Number(new URL(server.url).port));
  return {
    url: server.url,
    model,
    folders,
    logged,
    provider: async (id, fields, folder = folders.workspace) => {
      const file = join(folder, "providers", `${id}.yaml`);
      await mkdir(dirname(file), { recursive: true });
      const lines = Object.entries({ id, ...fields }).map(([key, value]) => `${key}: ${value}`);
      await writeFile(file, `${lines.join("\n")}\n`);
    },
    link: async (target) => {
      const link = join(base, "link-to-workspace");
      await symlink(target, link);
      return link;
    },
    close: async () => {
      await server.close();
      await model.close();
      await rm(base, { recursive: true, force: true });
    },
  };
}

export function post(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(`${url}/v1/models/chat`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  });
}

/** A chat request on the provider in the workspace. */
export function chatBody(
  workspaceRoot: string,
  provider = "ollama",
  request: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    workspaceRoot,
    provider,
    request: {
      model: "llama-test",
      messages: [{ role: "user", content: "Summarize this." }],
      ...request,
    },
  };
}
