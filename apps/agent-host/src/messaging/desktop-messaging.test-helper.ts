import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHostMessaging, type AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { ManualClock, MemoryScheduler, MemorySecretStore } from "@halonicjs/adapter-memory";
import { PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import {
  type EventsSignal,
  LiveSync,
  type OpenEvents,
  SyncCounters,
  SyncScheduler,
} from "@halonicjs/host-paperclip-sync";
import { paperclipKeyRoutes } from "../paperclip/paperclip-key-routes.ts";
import type { WorkspaceMayStart } from "../paperclip/workspace-may-start.ts";
import { profileOf } from "../profile-folder.ts";
import { webCryptoDigest } from "../profile-token-key.ts";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { readConnectionFile } from "./connection-file.ts";
import { DesktopMessaging } from "./desktop-messaging.ts";
import { MessagingEngineSetting } from "./messaging-engine-setting.ts";
import { messagingRoutes } from "./messaging-routes.ts";
import { ReplyWatch } from "./reply-watch.ts";
import { ServerPairings } from "./server-engine.ts";
import { ShellPaperclipKey } from "./shell-paperclip-key.test-helper.ts";
import { syncDiagnosticsRoute } from "./sync-diagnostics-route.ts";

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
  /** When set, it answers every request 401, as Paperclip does for an expired or revoked key. */
  refusesKey = false;
  /** What `/api/cli-auth/me` answers; without it, a Paperclip that doesn't know the route. */
  me: unknown;
  /** When set, answers `/api/cli-auth/me` in place of {@link FakePaperclip.me}: a fault or a redirect. */
  meAnswer: (() => Response) | undefined;
  /** The one chat `chats` answers, with Ada; a test changes it as a new message would. */
  chat: Record<string, unknown> = {
    id: "task-1",
    title: "Chat with Ada",
    conversationAgentId: "agent-ada",
    conversationState: "waiting",
    updatedAt: "2026-11-24T13:55:00.000Z",
  };
  /** What a read of the chat's comments answers. */
  comments: unknown[] = [];
  /** What `live-runs` answers: the runs going now. */
  liveRuns: unknown[] = [];
  /** What `heartbeat-runs` answers: the newest runs, finished ones included. */
  runs: unknown[] = [];
  /**
   * When set, the company's projects, approvals, decisions, secret proposals and join requests
   * answer empty lists, so a whole poll works and fills the local copy (`agent-host.paperclip-sync`).
   */
  servesInbox = false;
  /** What the secret proposals list answers while {@link FakePaperclip.servesInbox} is set. */
  secretProposals: unknown[] = [];
  /** The company's open tasks, which the Inbox reads cards on; none unless a test sets them. */
  tasks: unknown[] = [];
  /** Each open task's cards, by task ID. */
  cards: Record<string, unknown[]> = {};
  /**
   * When set, a request to `path` calls `arrived` once seen, then waits for `until`: a read held
   * open, which a test knows has started.
   */
  hold: { path: string; arrived: () => void; until: Promise<void> } | undefined;
  /** What the agent-tools plugin's reactions route answers for task-1; without it, no plugin. */
  reactions: unknown;

  /**
   * When set, every object in every answer also carries fields no app may
   * ever see (a key, a token, an address with a password), each holding this
   * value, so a test can show none of it leaves the provider.
   */
  canary: string | undefined;

  readonly fetch = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    const answer = await this.#answer(new Request(input, init));
    if (this.canary === undefined) return answer;
    const text = await answer.text();
    const canary = this.canary;
    return new Response(text === "" ? text : JSON.stringify(withCanary(JSON.parse(text), canary)), {
      status: answer.status,
      headers: { "content-type": "application/json", "x-canary": canary },
    });
  };

  async #answer(request: Request): Promise<Response> {
    if (this.offline) throw new TypeError("fetch failed");
    this.seen.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get("authorization"),
    });
    if (new URL(request.url).pathname === this.hold?.path) {
      this.hold.arrived();
      await this.hold.until;
    }
    if (this.refusesKey) return json({ error: "Unauthorized" }, 401);
    const path = new URL(request.url).pathname;
    if (path === `/api/companies/${acme.company}/agents`) {
      return json([
        { id: "agent-ada", name: "Ada", title: "CTO", status: "running" },
        { id: "agent-bo", name: "Bo", status: "paused" },
      ]);
    }
    if (path === `/api/companies/${acme.company}/chats`) return json([this.chat]);
    const list = this.#listAt(path);
    if (list !== undefined) return json(list);
    if (path === "/api/issues/task-1")
      return json({ identifier: "ACME-7", title: "Chat with Ada" });
    if (path === "/api/issues/task-1/comments") return json(this.#commentsAnswer(request.method));
    const cards = /^\/api\/issues\/([^/]+)\/interactions$/.exec(path)?.[1];
    if (cards !== undefined) return json(this.cards[cards] ?? []);
    if (path === "/api/cli-auth/revoke-current") return json({ revoked: true });
    if (path === "/api/cli-auth/me" && this.meAnswer !== undefined) return this.meAnswer();
    if (path === "/api/cli-auth/me" && this.me !== undefined) return json(this.me);
    return this.#pluginAnswer(path);
  }

  /** The agent-tools plugin's reactions route for task-1 when the test set one; otherwise 404. */
  #pluginAnswer(path: string): Response {
    const reactions = path === "/api/plugins/halonic.agent-tools/api/reactions/task-1";
    if (reactions && this.reactions !== undefined) return json(this.reactions);
    return json({ error: "API route not found" }, 404);
  }

  /**
   * The chat's comments for a read; for a send, the message the person sent to Ada, whose text
   * isn't read back.
   */
  #commentsAnswer(method: string): unknown {
    if (method !== "POST") return this.comments;
    return {
      id: "c1",
      body: "Sent",
      authorUserId: "user-1",
      createdAt: "2026-11-24T14:00:00.000Z",
    };
  }

  /** What a company list route answers, or `undefined` for any other path. */
  #listAt(path: string): unknown[] | undefined {
    const company = `/api/companies/${acme.company}`;
    // The open tasks, where the provider finds channels (`paperclip-client.channels`) and cards.
    if (path === `${company}/issues`) return this.tasks;
    if (path === `${company}/live-runs`) return this.liveRuns;
    if (path === `${company}/heartbeat-runs`) return this.runs;
    if (!this.servesInbox || !inboxLists.has(path)) return undefined;
    return path.endsWith("/secret-proposals") ? this.secretProposals : [];
  }
}

/** The company lists an Inbox read reads besides the tasks and their cards. */
const inboxLists = new Set(
  ["projects", "approvals", "decisions", "secret-proposals", "join-requests"].map(
    (list) => `/api/companies/${acme.company}/${list}`,
  ),
);

/** `value` with the canary's fields added to every object in it. */
function withCanary(value: unknown, canary: string): unknown {
  if (Array.isArray(value)) return value.map((item) => withCanary(item, canary));
  if (typeof value !== "object" || value === null) return value;
  const fields = Object.entries(value).map(([name, field]) => [name, withCanary(field, canary)]);
  // An address that carries the canary as its password, as a raw Paperclip field might.
  const instanceUrl = new URL(acme.address);
  instanceUrl.username = "board";
  instanceUrl.password = canary;
  return {
    ...Object.fromEntries(fields),
    apiKey: canary,
    adapterConfig: { token: canary, headers: { authorization: `Bearer ${canary}` } },
    instanceUrl: instanceUrl.href,
  };
}

/** Every events socket the host opened, newest last; a test speaks for the newest one. */
export class FakeLiveSockets {
  readonly opened: { onSignal: (signal: EventsSignal) => void; closed: boolean }[] = [];

  readonly open: OpenEvents = (onSignal) => {
    const socket = { onSignal, closed: false };
    this.opened.push(socket);
    return {
      close: () => {
        socket.closed = true;
      },
    };
  };

  /** The newest socket says `signal`. */
  say(signal: EventsSignal): void {
    const socket = this.opened.at(-1);
    if (socket === undefined) throw new Error("The host opened no events socket.");
    socket.onSignal(signal);
  }
}

/** A Halonic server stand-in on Acme's address: one source and one agent; it answers 401 to another token. */
export class FakeServer {
  readonly address = "https://halonic.acme.test";
  readonly seen: SeenRequest[] = [];
  /** The device token it accepts. */
  token = "acme-device-token-for-tests-only";
  /** What its inbox list answers. */
  inboxItems: unknown[] = [];

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
    return json({ items: path === "/api/messaging/inbox-items" ? this.inboxItems : [] });
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
  /** The sync's counters, which `GET /v1/sync/diagnostics` answers from. */
  counters: SyncCounters;
  /** The events sockets the host opened for its connections; none opens until a test says so. */
  sockets: FakeLiveSockets;
  /** Makes every later `live.add` or `live.remove` reject with `error`, as a scheduler that can't set or cancel a timer would. */
  failLive(call: "add" | "remove", error: Error): void;
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
  /** The shell's key hand-over, and the page's Disconnect. */
  paperclipKey: ShellPaperclipKey;
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
 * fake Paperclip and a scheduler the test moves on. Every workspace may
 * start a run unless `options.mayStart` says otherwise; with `noRunGate`,
 * the routes get no run gate at all, as a host without a profile folder.
 */
export async function startDesktop(
  options: { mayStart?: WorkspaceMayStart; noRunGate?: boolean } = {},
): Promise<Desktop> {
  const defaultGate: WorkspaceMayStart = async () => true;
  const mayStart = options.noRunGate === true ? undefined : (options.mayStart ?? defaultGate);
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
  // Its lines go nowhere, so `logged` holds only what failed.
  const counters = new SyncCounters({ clock, log: () => undefined });
  const sockets = new FakeLiveSockets();
  const liveFailures: { add?: Error; remove?: Error } = {};
  const messaging = new DesktopMessaging({
    counters,
    live: {
      add: (id, open) =>
        liveFailures.add === undefined ? live.add(id, open) : Promise.reject(liveFailures.add),
      remove: (id) =>
        liveFailures.remove === undefined ? live.remove(id) : Promise.reject(liveFailures.remove),
      countersFor: (id, kept) => live.countersFor(id, kept),
    },
    openEvents: () => sockets.open,
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
    {
      onTimer: async (timer) => {
        if (!(await sync.onTimer(timer))) await live.onTimer(timer);
      },
      onTick: async () => {},
    },
    clock,
  );
  const replies = new ReplyWatch({ clock, report: (error) => log(`watch replies ${error}\n`) });
  const sync = new SyncScheduler({
    scheduler,
    clock,
    poll: () => live.poll(() => messaging.refresh()),
    waiting: () => replies.waiting(),
  });
  const live = new LiveSync({
    scheduler,
    clock,
    sync,
    counters,
    onEvents: (ids) => messaging.heardEvents(ids),
    report: (error) => log(`live events ${error}\n`),
  });
  await sync.start();
  // The first full load is due at once, as the host's own scheduler would deliver it.
  await scheduler.runDue();
  const token = randomLaunchToken();
  const host: HostServer = await startHostServer(token, [
    ...paperclipKeyRoutes({
      keys,
      workspaceRoots,
      kept: async (binding) => (await messaging.of(binding.workspace))?.connect(binding.connection),
      log,
      usesServer: (folder) => messaging.usesServer(folder),
      mayStart,
    }),
    ...messagingRoutes({ messaging, sync, replies, log, mayStart }),
    syncDiagnosticsRoute(counters),
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
    counters,
    sockets,
    failLive: (call, error) => {
      liveFailures[call] = error;
    },
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
    paperclipKey: new ShellPaperclipKey(host.url, token, transport, answers),
    transport,
    answers,
    logged,
    writeConnection: (address, company) => writeConnection(address, company),
    filesIn,
    close: async () => {
      await live.stop();
      await sync.stop();
      messaging.close();
      await host.close();
      // A team read the test started may still be writing its cache file, and on
      // Windows removing a folder meanwhile fails with ENOTEMPTY: Node's own retries wait for it.
      const removal = { recursive: true, force: true, maxRetries: 5 } as const;
      await rm(workspace, removal);
      await rm(otherWorkspace, removal);
      await rm(profile, removal);
    },
  };
}

/** The page's calls to the host over loopback, recording every answer's text. */
export function pageTransport(url: string, token: string, answers: string[]): AgentHostTransport {
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
