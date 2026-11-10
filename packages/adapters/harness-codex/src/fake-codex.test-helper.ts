import type { SettingsFolderWriter } from "@halonicjs/adapter-harness-kit";

/**
 * The part of the contract suite's `FakeProgramIo` these programs use. The
 * helper declares it itself, because only test files may import a testing
 * package; a program written against it is a `FakeProgram`.
 */
interface ProgramIo {
  readLine(): Promise<string | null>;
  write(text: string): void;
  writeError(text: string): void;
}

/** A fake `codex`, for a `FakeSandboxSession` to run. */
type FakeCodex = (io: ProgramIo) => Promise<number>;

/** The thread and turn the fake Codex starts. */
export const fakeThreadId = "thread-fake";
export const fakeTurnId = "turn-fake";

/** A settings folder in memory, by path, for runs whose settings folder isn't on this computer's disk. */
export class MemorySettingsFolder implements SettingsFolderWriter {
  readonly files = new Map<string, string>();

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async write(path: string, text: string): Promise<void> {
    this.files.set(path, text);
  }
}

/** What the fake Codex was asked, by method, and the answers it got to its own requests. */
export class CodexLog {
  readonly requests: { method: string; params: unknown }[] = [];
  readonly answers: unknown[] = [];

  /** The params of the first request with `method`. */
  paramsOf(method: string): Record<string, unknown> | undefined {
    return this.requests.find((request) => request.method === method)?.params as
      | Record<string, unknown>
      | undefined;
  }
}

/** What the turn of a fake Codex can do: tell Halonic about the turn, and ask it things. */
export interface FakeTurn {
  notify(method: string, params: Record<string, unknown>): void;
  /** Sends a request and waits for Halonic's answer. */
  request(method: string, params: Record<string, unknown>): Promise<unknown>;
  /** Waits for a request from Halonic with `method`, such as `turn/steer`, and gives its params. */
  received(method: string): Promise<Record<string, unknown>>;
}

/**
 * A fake `codex app-server`: it answers `initialize`, `thread/start` and
 * `turn/start` as Codex 0.166.0 does, then plays `turn`, and runs until its
 * input ends or it is stopped. Every request it gets goes into `log`.
 */
export function fakeCodex(
  turn: (codex: FakeTurn) => Promise<void>,
  log = new CodexLog(),
): FakeCodex {
  return async (io) => {
    const waitingAnswers = new Map<number, (result: unknown) => void>();
    const waitingRequests = new Map<string, (params: Record<string, unknown>) => void>();
    let nextId = 100;
    const send = (message: object) => io.write(`${JSON.stringify(message)}\n`);
    const codex: FakeTurn = {
      notify: (method, params) => send({ method, params: { threadId: fakeThreadId, ...params } }),
      request: (method, params) =>
        new Promise((resolve) => {
          const id = nextId++;
          waitingAnswers.set(id, resolve);
          send({ id, method, params: { threadId: fakeThreadId, ...params } });
        }),
      received: (method) => new Promise((resolve) => waitingRequests.set(method, resolve)),
    };
    for (let line = await io.readLine(); line !== null; line = await io.readLine()) {
      const message = JSON.parse(line) as { id?: number; method?: string; params?: unknown };
      if (message.method === undefined) {
        log.answers.push(message);
        if (message.id !== undefined) waitingAnswers.get(message.id)?.(message);
        continue;
      }
      log.requests.push({ method: message.method, params: message.params });
      waitingRequests.get(message.method)?.(message.params as Record<string, unknown>);
      if (message.id === undefined) continue;
      send({ id: message.id, result: resultOf(message.method) });
      if (message.method === "turn/start") void turn(codex);
    }
    return 0;
  };
}

/** Codex's answer to a request from Halonic. */
function resultOf(method: string): unknown {
  switch (method) {
    case "initialize":
      return { userAgent: "halonic/0.166.0", codexHome: "/agents/writer/settings" };
    case "thread/start":
      return { thread: { id: fakeThreadId }, model: "gpt-5.5", modelProvider: "halonic" };
    case "turn/start":
      return { turn: { id: fakeTurnId, status: "inProgress", items: [] } };
    case "turn/steer":
      return { turnId: fakeTurnId };
    default:
      return {};
  }
}

/** The agent says `text`, then its turn completes. */
export async function answer(codex: FakeTurn, text: string): Promise<void> {
  codex.notify("item/completed", {
    turnId: fakeTurnId,
    item: { type: "agentMessage", id: "msg-1", text },
  });
  codex.notify("turn/completed", { turn: { id: fakeTurnId, status: "completed", error: null } });
}

/** Codex finishing with "Teal.". */
export const codexFinishing: FakeCodex = fakeCodex((codex) => answer(codex, "Teal."));

/** Codex failing before it answers anything: it prints `message` to standard error and exits with 1. */
export function codexFailing(message: string): FakeCodex {
  return async (io) => {
    io.writeError(`${message}\n`);
    return 1;
  };
}
