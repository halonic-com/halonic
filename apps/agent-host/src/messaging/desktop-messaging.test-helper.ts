import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentHostMessaging,
  AgentHostPaperclipKey,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import { ManualClock, MemoryScheduler, MemorySecretStore } from "@halonicjs/adapter-memory";
import { PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import { paperclipKeyRoutes } from "../paperclip/paperclip-key-routes.ts";
import { profileOf } from "../profile-folder.ts";
import { webCryptoDigest } from "../profile-token-key.ts";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { readConnectionFile } from "./connection-file.ts";
import { DesktopMessaging } from "./desktop-messaging.ts";
import { MessagingEngineSetting } from "./messaging-engine-setting.ts";
import { MessagingPoller } from "./messaging-poller.ts";
import { messagingRoutes } from "./messaging-routes.ts";
import { ServerPairings } from "./server-engine.ts";

// A fake key only these tests use, so its absence from answers and files means something.
export const testKey = "pcp_board_fake-key-for-tests-only";
export const acme = { address: "https://paperclip.acme.test", company: "acme-company" };

/** One request the fake Paperclip saw. */
export interface SeenRequest {
  url: string;
  method: string;
  authorization: string | null;
}

/** A Paperclip stand-in on Acme's address: two agents and a chat with Ada; offline when the test says so. */
export class FakePaperclip {
  readonly seen: SeenRequest[] = [];
  offline = false;
  /** What `/api/cli-auth/me` answers; without it, a Paperclip that doesn't know the route. */
  me: unknown;
  /** When set, answers `/api/cli-auth/me` in place of {@link FakePaperclip.me}: a fault or a redirect. */
  meAnswer: (() => Response) | undefined;
  /** What `live-runs` answers: the runs going now. */
  liveRuns: unknown[] = [];
  /** What `heartbeat-runs` answers: the newest runs, finished ones included. */
  runs: unknown[] = [];

  readonly fetch = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    if (this.offline) throw new TypeError("fetch failed");
    this.seen.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get("authorization"),
    });
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
    // The open tasks, where the provider finds channels (`paperclip-client.channels`): none here.
    if (path === `/api/companies/${acme.company}/issues`) return json([]);
    if (path === `/api/companies/${acme.company}/live-runs`) return json(this.liveRuns);
    if (path === `/api/companies/${acme.company}/heartbeat-runs`) return json(this.runs);
    if (path === "/api/issues/task-1")
      return json({ identifier: "ACME-7", title: "Chat with Ada" });
    if (path === "/api/cli-auth/revoke-current") return json({ revoked: true });
    if (path === "/api/cli-auth/me" && this.meAnswer !== undefined) return this.meAnswer();
    if (path === "/api/cli-auth/me" && this.me !== undefined) return json(this.me);
    return json({ error: "API route not found" }, 404);
  };
}

/** A Halonic server stand-in on Acme's address: one source and one agent; it answers 401 to another token. */
export class FakeServer {
  readonly address = "https://halonic.acme.test";
  readonly seen: SeenRequest[] = [];
  /** The device token it accepts. */
  token = "acme-device-token-for-tests-only";

  readonly fetch = async (request: Request): Promise<Response> => {
    const authorization = request.headers.get("authorization");
    this.seen.push({ url: request.url, method: request.method, authorization });
    if (authorization !== `Bearer ${this.token}`) return json({ code: "signed-out" }, 401);
    const path = new URL(request.url).pathname;
    const source = "halonic-server:acme";
    if (path === "/api/messaging/sources") {
      const state = { kind: "online", asOf: "2026-11-24T14:00:00.000Z" };
      return json({ items: [{ id: source, provider: "halonic", label: "Acme server", state }] });
    }
    if (path === "/api/messaging/agents") {
      return json({ items: [{ id: "server-cy", source, name: "Cy", activity: "idle" }] });
    }
    return json({ items: [] });
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Everything one test reaches: the host's parts, Studio's side of them, and the folders. */
export interface Desktop {
  paperclip: FakePaperclip;
  server: FakeServer;
  /** The host's keychain, where a workspace's device token is kept. */
  keychain: MemorySecretStore;
  /** Each workspace's messaging engine setting, in {@link Desktop.profile}. */
  setting: MessagingEngineSetting;
  messaging: DesktopMessaging;
  keys: PaperclipKeys;
  /** Moves the scheduler's clock on by `ms` and delivers the timers that are due: no sleep. */
  wait(ms: number): Promise<void>;
  workspace: string;
  /** A second workspace the launcher named, with the same `halonic.yaml`; nobody connected it yet. */
  otherWorkspace: string;
  profile: string;
  /** What Studio reads through, as `AgentMessagingService` gives it. */
  studio: AgentHostMessaging;
  /** What Studio reads through for {@link Desktop.otherWorkspace}. */
  otherStudio: AgentHostMessaging;
  /** Studio's key hand-over and Disconnect. */
  paperclipKey: AgentHostPaperclipKey;
  /** The page's calls to the host. */
  transport: AgentHostTransport;
  /** Every answer body the host sent the page, as text. */
  answers: string[];
  /** Every line the host logged. */
  logged: string[];
  /** Rewrites the workspace's `connections/paperclip/halonic.yaml`. */
  writeConnection(address: string, company?: string): Promise<void>;
  /** Every file under `folder`, with its text. */
  filesIn(folder: string): Promise<Map<string, string>>;
  close(): Promise<void>;
}

/**
 * The desktop engine on a real loopback server, with two of Acme's workspaces
 * (the same connection file, nobody connected yet), a profile folder for the cache, a
 * fake Paperclip and a scheduler the test moves on.
 */
export async function startDesktop(): Promise<Desktop> {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), "acme-workspace-")));
  const otherWorkspace = await realpath(await mkdtemp(join(tmpdir(), "acme-other-workspace-")));
  const workspaceRoots = [workspace, otherWorkspace];
  const profile = await realpath(await mkdtemp(join(tmpdir(), "acme-profile-")));
  const paperclip = new FakePaperclip();
  const server = new FakeServer();
  const keychain = new MemorySecretStore();
  const setting = new MessagingEngineSetting({
    profile: profileOf(profile),
    digest: webCryptoDigest,
    warn: (message) => log(`${message}\n`),
  });
  const keys = new PaperclipKeys();
  const clock = new ManualClock("2026-11-24T14:00:00.000Z");
  const logged: string[] = [];
  const log = (text: string) => logged.push(text);
  const messaging = new DesktopMessaging({
    keys,
    cacheRoot: join(profile, "agent-messaging-cache"),
    workspaceRoots,
    readConnection: readConnectionFile,
    report: (failure) => log(`${failure.provider} ${failure.action}\n`),
    warn: log,
    // Each request goes to the fake whose address it names.
    fetch: (input, init) => {
      const request = new Request(input, init);
      return request.url.startsWith(server.address)
        ? server.fetch(request)
        : paperclip.fetch(request);
    },
    engines: { setting, pairings: new ServerPairings(keychain), warn: log },
    now: () => clock.now(),
  });
  const scheduler = new MemoryScheduler(
    { onTimer: async (timer) => void (await poller.onTimer(timer)), onTick: async () => {} },
    clock,
  );
  const poller = new MessagingPoller({ scheduler, clock, poll: () => messaging.refresh() });
  await poller.start();
  const token = randomLaunchToken();
  const host: HostServer = await startHostServer(token, [
    ...paperclipKeyRoutes({
      keys,
      workspaceRoots,
      kept: async (binding) => (await messaging.of(binding.workspace))?.connect(binding.connection),
      log,
      usesServer: (folder) => messaging.usesServer(folder),
    }),
    ...messagingRoutes({ messaging, poller, log }),
  ]);
  const answers: string[] = [];
  const transport = pageTransport(host.url, token, answers);
  const writeConnection = async (address: string, company = acme.company, into = workspace) => {
    await mkdir(join(into, "connections", "paperclip"), { recursive: true });
    const text = `label: Halonic\naddress: ${address}\ncompany: ${company}\n`;
    await writeFile(join(into, "connections", "paperclip", "halonic.yaml"), text);
  };
  await writeConnection(acme.address);
  await writeConnection(acme.address, acme.company, otherWorkspace);
  return {
    paperclip,
    server,
    keychain,
    setting,
    messaging,
    keys,
    wait: async (ms) => {
      clock.advance(ms);
      await scheduler.runDue();
    },
    workspace,
    otherWorkspace,
    profile,
    studio: new AgentHostMessaging(transport, workspace),
    otherStudio: new AgentHostMessaging(transport, otherWorkspace),
    paperclipKey: new AgentHostPaperclipKey(transport),
    transport,
    answers,
    logged,
    writeConnection: (address, company) => writeConnection(address, company),
    filesIn,
    close: async () => {
      await poller.stop();
      messaging.close();
      await host.close();
      await rm(workspace, { recursive: true, force: true });
      await rm(otherWorkspace, { recursive: true, force: true });
      await rm(profile, { recursive: true, force: true });
    },
  };
}

/** The page's calls to the host over loopback, recording every answer's text. */
function pageTransport(url: string, token: string, answers: string[]): AgentHostTransport {
  return {
    request: async (route, body) => {
      const [method = "GET", path = "/"] = route.split(" ");
      const response = await fetch(`${url}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      answers.push(text);
      return { status: response.status, body: JSON.parse(text) as unknown };
    },
    stream: () => Promise.reject(new Error("No stream route is used here.")),
  };
}

/** Every file under `folder`, with its text; a missing folder has none. */
async function filesIn(folder: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const entries = await readdir(folder, { recursive: true, withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(path, await readFile(path, "utf8"));
  }
  return files;
}
