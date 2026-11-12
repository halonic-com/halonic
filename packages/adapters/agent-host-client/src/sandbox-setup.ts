import { parse, type Schema, s } from "@halonicjs/schema-kit";
import { type AgentHostAnswer, type AgentHostTransport, readAnswer } from "./transport.ts";

/** What the host was asked to do with the sandbox. */
export type SandboxSetupVerb = "setup" | "remove";

/**
 * How a setup or removal ended: done, or `cancelled` (the administrator
 * prompt was turned down), `failed`, or `check_failed` (set up, but the check
 * doesn't pass), with a reason sentence and the helper's code when it gave one.
 */
export type SandboxSetupResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly outcome: "cancelled" | "failed" | "check_failed";
      readonly reason: string;
      readonly code?: number | undefined;
    };

/** A setup or removal that has ended, and when (ISO time). */
export interface FinishedSandboxSetup {
  readonly verb: SandboxSetupVerb;
  readonly result: SandboxSetupResult;
  readonly finishedAt: string;
}

/** Which one runs in the host now, if any, and the last one that ended there. */
export interface SandboxSetupStatus {
  readonly running: SandboxSetupVerb | null;
  readonly last: FinishedSandboxSetup | null;
}

const verbSchema = s.enum(["setup", "remove"]);

const resultSchema = s.discriminatedUnion("ok", [
  s.object({ ok: s.literal(true) }).strict(),
  s
    .object({
      ok: s.literal(false),
      outcome: s.enum(["cancelled", "failed", "check_failed"]),
      reason: s.string(),
      code: s.number().int().optional(),
    })
    .strict(),
]) satisfies Schema<SandboxSetupResult>;

const finishedSchema = s
  .object({ verb: verbSchema, result: resultSchema, finishedAt: s.string() })
  .strict() satisfies Schema<FinishedSandboxSetup>;

const statusSchema = s
  .object({ running: verbSchema.nullable(), last: finishedSchema.nullable() })
  .strict() satisfies Schema<SandboxSetupStatus>;

const inUseSchema = s.object({ runs: s.number().int().min(1) });

/** Waits `ms` milliseconds, or until `signal` aborts; tests pass one that doesn't wait. */
export type Pause = (ms: number, signal?: AbortSignal) => Promise<void>;

const pause: Pause = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * The agent sandbox's one-time setup and its removal, run by the agent host
 * for Settings › Agent sandbox (HAL-1451). Each asks Windows for
 * administrator rights once, so it can take as long as the person takes to
 * answer. The host answers a start at once, and {@link AgentHostSandboxSetup.ended}
 * follows it for as long as it runs: nothing here gives up early.
 */
export class AgentHostSandboxSetup {
  readonly #transport: AgentHostTransport;
  readonly #pause: Pause;

  constructor(transport: AgentHostTransport, options: { readonly pause?: Pause } = {}) {
    this.#transport = transport;
    this.#pause = options.pause ?? pause;
  }

  /** @throws {@link AgentHostError} when the host refuses, or can't be reached */
  async status(): Promise<SandboxSetupStatus> {
    const route = "GET /v1/sandbox/setup";
    return readAnswer(route, await this.#transport.request(route), statusSchema);
  }

  /**
   * Starts the setup, or joins the one that runs.
   *
   * @throws {@link AgentHostError} `sandbox_busy` while a removal runs, or when the host can't be reached
   */
  async startSetUp(): Promise<SandboxSetupStatus> {
    const route = "POST /v1/sandbox/setup";
    return readAnswer(route, accepted(await this.#transport.request(route, {})), statusSchema);
  }

  /**
   * Starts the removal, or joins the one that runs. While sandboxed runs go
   * on, the host refuses before any prompt, and this answers how many.
   *
   * @throws {@link AgentHostError} `sandbox_busy` while a setup runs, or when the host can't be reached
   */
  async startRemove(): Promise<SandboxSetupStatus | { readonly inUse: number }> {
    const route = "POST /v1/sandbox/remove";
    const answer = await this.#transport.request(route, {});
    if (answer.status === 409) {
      const inUse = parse(inUseSchema, answer.body);
      if (inUse.ok) return { inUse: inUse.value.runs };
    }
    return readAnswer(route, accepted(answer), statusSchema);
  }

  /**
   * Asks the host every `intervalMs` until no `verb` runs, and answers how
   * it ended. Undefined when `signal` aborted first, or when the host no
   * longer knows (it was restarted).
   *
   * @throws {@link AgentHostError} when the host refuses, or can't be reached
   */
  async ended(
    verb: SandboxSetupVerb,
    options: { readonly intervalMs?: number; readonly signal?: AbortSignal } = {},
  ): Promise<FinishedSandboxSetup | undefined> {
    for (;;) {
      if (options.signal?.aborted) return undefined;
      const now = await this.status();
      if (now.running !== verb) return now.last?.verb === verb ? now.last : undefined;
      await this.#pause(options.intervalMs ?? 1000, options.signal);
    }
  }
}

/** The host answers a start with 202; read it as the 200 `readAnswer` expects. */
function accepted(answer: AgentHostAnswer): AgentHostAnswer {
  return answer.status === 202 ? { ...answer, status: 200 } : answer;
}
