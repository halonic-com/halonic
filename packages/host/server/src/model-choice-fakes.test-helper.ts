import type {
  ChoiceKey,
  CurrentModel,
  FirstRunKeyProvider,
  LocalModels,
  ModelChoice,
  ModelChoiceLine,
  ModelChoicePreview,
  ModelChoiceSaved,
  ModelChoiceService,
  ModelChoiceTest,
} from "@halonicjs/app";
import type { Coordination } from "@halonicjs/ports";
import type { RequestLogEntry, Server } from "./api.ts";
import type { ModelChoicePort } from "./model-choice-api.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

/** A LAN name the server answers to over plain http when a password is set. */
export const lanHost = "lan.acme.example:8080";

/** The trust line's facts every fake gives. */
export const fakeLine: ModelChoiceLine = {
  reaches: { name: "Anthropic", secrets: 1, host: undefined, local: false },
  localOnlyOff: true,
};

/** A service that records what it was asked, with the key revealed so a test can compare it. */
export class FakeChoiceService implements ModelChoiceService {
  readonly calls: unknown[][] = [];
  testOutcome: ModelChoiceTest = { kind: "tested", outcome: "ok", testId: "test_1" };
  models: LocalModels = { kind: "one", model: "llama3.2" };
  saved: ModelChoiceSaved = { ok: true, changes: [], trusted: false };
  currentModel: CurrentModel | undefined = { kind: "sample" };
  failWith: Error | undefined;

  async test(choice: ModelChoice, key?: ChoiceKey): Promise<ModelChoiceTest> {
    this.calls.push(["test", choice, key?.reveal()]);
    if (this.failWith !== undefined) throw this.failWith;
    return this.testOutcome;
  }
  async keySaved(provider: FirstRunKeyProvider): Promise<boolean> {
    this.calls.push(["keySaved", provider]);
    return provider === "anthropic";
  }
  async lineFacts(choice: ModelChoice): Promise<ModelChoiceLine | undefined> {
    this.calls.push(["lineFacts", choice]);
    return choice.kind === "key" ? fakeLine : undefined;
  }
  async preview(testId: string): Promise<ModelChoicePreview | undefined> {
    this.calls.push(["preview", testId]);
    return testId === "test_1" ? { ...fakeLine, fingerprint: "sha256:fake" } : undefined;
  }
  async localModels(): Promise<LocalModels> {
    this.calls.push(["localModels"]);
    return this.models;
  }
  async current(): Promise<CurrentModel | undefined> {
    this.calls.push(["current"]);
    return this.currentModel;
  }
  async continue(testId: string, shownFingerprint: string | undefined): Promise<ModelChoiceSaved> {
    this.calls.push(["continue", testId, shownFingerprint]);
    return this.saved;
  }
}

/** One fake service per session, as a host keeps them; `sessions` lists what the server asked for. */
export class FakeChoicePort implements ModelChoicePort {
  readonly services = new Map<string, FakeChoiceService>();
  readonly sessions: string[] = [];
  forSession(session: string): FakeChoiceService {
    this.sessions.push(session);
    const service = this.services.get(session) ?? new FakeChoiceService();
    this.services.set(session, service);
    return service;
  }
  /** What every session's service was asked, in session order. */
  allCalls(): unknown[][] {
    return [...this.services.values()].flatMap((service) => service.calls);
  }
  /** The one service asked so far; fails when there is none or more than one. */
  only(): FakeChoiceService {
    const [service, ...more] = this.services.values();
    if (service === undefined || more.length > 0) throw new Error("expected exactly one session");
    return service;
  }
}

/** With `password`, a session is needed, and the server also answers to {@link lanHost}. */
export function choiceSetup(options: { port?: boolean; password?: boolean } = {}) {
  const port = new FakeChoicePort();
  const requestLog: RequestLogEntry[] = [];
  const errors: unknown[] = [];
  const clock = new TestClock();
  const server: Server = testServer({
    passwordHash: options.password === true ? "hash:pw" : null,
    clock,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    ...(options.port === false ? {} : { modelChoice: port }),
    requestLog: { record: (entry) => requestLog.push(entry) },
    errorLog: { record: (cause) => errors.push(cause) },
    config: { allowedHosts: ["localhost", lanHost], maxBodyBytes: 4096 },
  });
  return { server, port, requestLog, errors, clock };
}

/**
 * Signs in over the LAN name; the headers that make a request come from that session. With
 * `secure`, as over HTTPS, whose session cookie is only read over HTTPS.
 */
export async function lanSession(server: Server, secure = false): Promise<Record<string, string>> {
  const response = await server.handle(
    new Request(`http://${lanHost}/api/login`, {
      method: "POST",
      headers: { host: lanHost, "content-type": "application/json" },
      body: JSON.stringify({ password: "pw" }),
    }),
    { secure },
  );
  return { host: lanHost, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

/** Sends a request; a body is sent as JSON unless the headers say otherwise. */
export function send(
  server: Server,
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string>; secure?: boolean } = {},
): Promise<Response> {
  const host = options.headers?.["host"] ?? "localhost";
  const headers = { host, "content-type": "application/json", ...options.headers };
  const body = options.body === undefined ? {} : { body: JSON.stringify(options.body) };
  return server.handle(
    new Request(`http://${host}/api/model-choice/${path}`, { method, headers, ...body }),
    options.secure === undefined ? undefined : { secure: options.secure },
  );
}
