import type {
  Harness,
  HarnessBridge,
  HarnessDetection,
  HarnessEvent,
  HarnessInput,
  HarnessRun,
  HarnessTask,
  SandboxSession,
} from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import { AgentHostSession } from "./sandbox.ts";
import {
  AgentHostError,
  type AgentHostTransport,
  answerError,
  checked,
  readAnswer,
} from "./transport.ts";

/** The port's `environment`, which runs here, not in the host: it only reads its arguments. */
export type HarnessEnvironment = NonNullable<Harness["environment"]>;

/** What the harness stand-ins need besides the transport. */
export interface AgentHostHarnessOptions {
  /**
   * The id of a bridge open in the host, by the address and token the
   * engine got for it, so a run names its bridge to the host by id and the
   * token never travels again.
   */
  bridgeIdOf(bridge: HarnessBridge): string | undefined;
  /** Each harness's own `environment` function (`claudeCodeEnvironment`, ...), by harness id. */
  environments: Readonly<Record<string, HarnessEnvironment>>;
}

const listedSchema = s.array(s.object({ id: s.string().min(1), name: s.string() }).strict());

const detectionSchema = s.discriminatedUnion("status", [
  s.object({ status: s.literal("ready"), version: s.string() }).strict(),
  s.object({ status: s.literal("signed-out"), version: s.string() }).strict(),
  s.object({ status: s.literal("missing") }).strict(),
  s
    .object({ status: s.literal("unsupported"), version: s.string(), supported: s.string() })
    .strict(),
  s.object({ status: s.literal("failed"), error: s.string() }).strict(),
]);

/** What the host's sign-in route answers. */
export type SignInOpened =
  | { readonly opened: true }
  | { readonly opened: false; readonly reason: string; readonly command: string };

const signInSchema = s.discriminatedUnion("opened", [
  s.object({ opened: s.literal(true) }).strict(),
  s.object({ opened: s.literal(false), reason: s.string(), command: s.string() }).strict(),
]);

const runLineSchema = s.discriminatedUnion("type", [
  s.object({ type: s.literal("started"), run: s.string().min(1) }).strict(),
  s
    .object({ type: s.literal("event"), event: s.object({ type: s.string() }).passthrough() })
    .strict(),
  s.object({ type: s.literal("finished") }).strict(),
  s.object({ type: s.literal("failed"), message: s.string() }).strict(),
]);

/**
 * A stand-in `Harness` for each harness the agent host offers.
 *
 * @throws {@link AgentHostError} when the host refuses, or can't be reached
 */
export async function agentHostHarnesses(
  transport: AgentHostTransport,
  options: AgentHostHarnessOptions,
): Promise<AgentHostHarness[]> {
  const route = "GET /v1/harnesses";
  const listed = readAnswer(route, await transport.request(route), listedSchema);
  return listed.map((harness) => new AgentHostHarness(transport, harness, options));
}

/**
 * The engine's `Harness`, as a stand-in for one the agent host runs. Its
 * runs start in the host, in a session and with a bridge opened there
 * before. `environment` is the harness's own function, called here.
 */
export class AgentHostHarness implements Harness {
  readonly id: string;
  readonly name: string;
  readonly environment?: HarnessEnvironment;
  readonly #transport: AgentHostTransport;
  readonly #bridgeIdOf: AgentHostHarnessOptions["bridgeIdOf"];

  constructor(
    transport: AgentHostTransport,
    listed: { readonly id: string; readonly name: string },
    options: AgentHostHarnessOptions,
  ) {
    this.id = listed.id;
    this.name = listed.name;
    this.#transport = transport;
    this.#bridgeIdOf = options.bridgeIdOf;
    const environment = options.environments[listed.id];
    if (environment !== undefined) this.environment = environment;
  }

  async detect(): Promise<HarnessDetection> {
    const route = "POST /v1/harnesses/detect";
    const answer = await this.#transport.request(route, { harness: this.id });
    return readAnswer(route, answer, detectionSchema) as HarnessDetection;
  }

  /**
   * Opens a terminal the person can see, running the program's own sign-in
   * for one agent, pointed at that agent's settings folder (HAL-5395). When
   * no window opened, the answer has the command to run by hand.
   *
   * @throws {@link AgentHostError} with kind `no_sign_in` for a harness
   * without a sign-in of its own, or `sign_in_refused` with the reason
   */
  async openSignIn(settingsFolder: string): Promise<SignInOpened> {
    const route = "POST /v1/harnesses/sign-in";
    const answer = await this.#transport.request(route, { harness: this.id, settingsFolder });
    return readAnswer(route, answer, signInSchema) as SignInOpened;
  }

  /**
   * @throws when the session isn't open in the agent host, or the bridge wasn't opened there
   */
  start(task: HarnessTask, session: SandboxSession, bridge: HarnessBridge): HarnessRun {
    if (!(session instanceof AgentHostSession)) {
      throw new Error(
        `${this.name} runs in the agent host, so its sandbox session must be open there.`,
      );
    }
    const bridgeId = this.#bridgeIdOf(bridge);
    if (bridgeId === undefined) {
      throw new Error(`${this.name} runs in the agent host, so its bridge must be open there.`);
    }
    return new AgentHostRun(this.#transport, {
      harness: this.id,
      task,
      session: session.hostId,
      bridge: bridgeId,
    });
  }
}

/**
 * A run going on in the agent host. It reads the host's stream from the
 * start, so `send` and `cancel` work before anyone iterates the events.
 */
class AgentHostRun implements HarnessRun {
  readonly #transport: AgentHostTransport;
  readonly #stop = new AbortController();
  readonly #runId: Promise<string>;
  /** The run's id once the host has started it. */
  #run: string | undefined;
  readonly #ended: Promise<void>;
  #events!: ReadableStreamDefaultController<HarnessEvent>;
  readonly #readable = new ReadableStream<HarnessEvent>({
    start: (controller) => {
      this.#events = controller;
    },
  });

  constructor(transport: AgentHostTransport, body: unknown) {
    this.#transport = transport;
    let started!: (run: string) => void;
    let notStarted!: (error: unknown) => void;
    this.#runId = new Promise((resolve, reject) => {
      started = (run) => {
        this.#run = run;
        resolve(run);
      };
      notStarted = reject;
    });
    // Awaited by `send` and `cancel` only; a run that never starts mustn't be an unhandled rejection.
    this.#runId.catch(() => {});
    this.#ended = this.#read(body, started).then(
      () => {
        // A stream that ended before `started` leaves no run to send to or cancel.
        // Once the run has started, this does nothing.
        notStarted(
          new AgentHostError(
            200,
            "run_not_started",
            "The agent host ended the run before it started.",
          ),
        );
        this.#events.close();
      },
      (error: unknown) => {
        notStarted(error);
        this.#events.error(error);
      },
    );
  }

  async *[Symbol.asyncIterator](): AsyncIterator<HarnessEvent> {
    const reader = this.#readable.getReader();
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) return;
        yield next.value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** @throws {@link AgentHostError} `send_failed` when the run refuses the input */
  async send(input: HarnessInput): Promise<void> {
    const route = "POST /v1/harnesses/runs/send";
    const answer = await this.#transport.request(route, { run: await this.#runId, input });
    if (answer.status !== 200) throw answerError(route, answer);
  }

  /**
   * Stops the run in the host, and resolves once its stream has ended. A run
   * the host hasn't started yet is hung up on at once, which stops it there,
   * rather than waiting for the harness's program to start.
   */
  async cancel(): Promise<void> {
    const run = this.#run;
    if (run === undefined) {
      this.#stop.abort();
      await this.#ended.catch(() => {});
      return;
    }
    const route = "POST /v1/harnesses/runs/cancel";
    try {
      const answer = await this.#transport.request(route, { run });
      // 404: the run has already ended.
      if (answer.status !== 200 && answer.status !== 404) throw answerError(route, answer);
    } catch (error) {
      // Hanging up also cancels the run in the host, once it notices.
      this.#stop.abort();
      throw error;
    }
    await this.#ended.catch(() => {});
  }

  /** Reads the stream: the run's id, its events, then how it ended. */
  async #read(body: unknown, started: (run: string) => void): Promise<void> {
    const route = "POST /v1/harnesses/runs/start";
    const answer = await this.#transport.stream(route, body, { signal: this.#stop.signal });
    if (!answer.ok) throw answerError(route, answer.answer);
    for await (const value of answer.lines) {
      const line = checked(route, value, runLineSchema);
      switch (line.type) {
        case "started":
          started(line.run);
          break;
        case "event":
          this.#events.enqueue(line.event as unknown as HarnessEvent);
          break;
        case "finished":
          return;
        case "failed":
          throw new AgentHostError(200, "run_failed", line.message);
      }
    }
    throw new AgentHostError(
      200,
      "run_cut_off",
      "The agent host stopped sending the run's events.",
    );
  }
}
