import { parse, type Schema, s } from "@halonicjs/schema-kit";
import { type AgentHostAnswer, type AgentHostTransport, readAnswer } from "./transport.ts";

/** What the host was asked to do with the sandbox. */
export type SandboxSetupVerb = "setup" | "remove" | "remove-wsl";

/** What the user chose for the files of Halonic's WSL distro (HAL-10974). There is no default. */
export type WslRemoveChoice =
  | { readonly choice: "export-then-remove"; readonly file: string }
  | { readonly choice: "remove-only" };

/**
 * How removing the WSL setup ended. `kept`: nothing changed. `removed`: the distro is
 * gone (and the backup is at `exportedTo`, if one was made). `refused`: nothing
 * changed, for `reason`. `failed`: a step ended with an error; after `export-failed`
 * nothing was removed.
 */
export type WslRemoveOutcome =
  | { readonly outcome: "kept" }
  | { readonly outcome: "removed"; readonly exportedTo?: string | undefined }
  | {
      readonly outcome: "refused";
      readonly reason: "distro-not-ours" | "distro-missing" | "bad-export-file";
    }
  | {
      readonly outcome: "failed";
      readonly reason: "export-failed" | "unregister-failed";
      readonly detail: string;
    };

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
export type FinishedSandboxSetup =
  | {
      readonly verb: "setup";
      readonly result: SandboxSetupResult;
      readonly finishedAt: string;
    }
  | {
      readonly verb: "remove";
      readonly result: SandboxSetupResult;
      readonly finishedAt: string;
    }
  | {
      readonly verb: "remove-wsl";
      /** A host that threw answers the generic failure instead of an outcome. */
      readonly result: WslRemoveOutcome | Extract<SandboxSetupResult, { ok: false }>;
      readonly finishedAt: string;
    };

/** Which one runs in the host now, if any, and the last one that ended there. */
export interface SandboxSetupStatus {
  readonly running: SandboxSetupVerb | null;
  readonly last: FinishedSandboxSetup | null;
}

const verbSchema = s.enum(["setup", "remove", "remove-wsl"]);

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

const wslResultSchema = s.union([
  s.object({ outcome: s.literal("kept") }).strict(),
  s.object({ outcome: s.literal("removed"), exportedTo: s.string().optional() }).strict(),
  s
    .object({
      outcome: s.literal("refused"),
      reason: s.enum(["distro-not-ours", "distro-missing", "bad-export-file"]),
    })
    .strict(),
  s
    .object({
      outcome: s.literal("failed"),
      reason: s.enum(["export-failed", "unregister-failed"]),
      detail: s.string(),
    })
    .strict(),
]);

const finishedSchema = s.union([
  s
    .object({
      verb: s.enum(["setup", "remove"]),
      result: resultSchema,
      finishedAt: s.string(),
    })
    .strict(),
  s
    .object({
      verb: s.literal("remove-wsl"),
      result: s.union([wslResultSchema, resultSchema]),
      finishedAt: s.string(),
    })
    .strict(),
]) as Schema<FinishedSandboxSetup>;

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
   * Says how a setup ended that the shell ran through the signed helper with its own
   * administrator prompt (HAL-14841): the host words the helper's `exitCode` and, for 0, runs
   * its unelevated check. Done only when that check passes.
   *
   * @throws {@link AgentHostError} `sandbox_busy` while the host runs a setup or removal itself, or when the host can't be reached
   */
  async afterHelper(exitCode: number): Promise<SandboxSetupResult> {
    const route = "POST /v1/sandbox/setup/elevated";
    return readAnswer(route, await this.#transport.request(route, { exitCode }), resultSchema);
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
   * Does the host's half of a removal that the shell then runs through the signed helper with
   * its own administrator prompt (HAL-14841): it takes back the grants the sandbox kept on the
   * user's folders. `ok` means the shell may start the helper. While sandboxed runs go on, the
   * host refuses before any prompt, and this answers how many.
   *
   * @throws {@link AgentHostError} `sandbox_busy` while the host runs a setup or removal itself, or when the host can't be reached
   */
  async beforeRemoveHelper(): Promise<SandboxSetupResult | { readonly inUse: number }> {
    const route = "POST /v1/sandbox/remove/before";
    const answer = await this.#transport.request(route, {});
    if (answer.status === 409) {
      const inUse = parse(inUseSchema, answer.body);
      if (inUse.ok) return { inUse: inUse.value.runs };
    }
    return readAnswer(route, answer, resultSchema);
  }

  /**
   * Says how a removal ended that the shell ran through the signed helper (HAL-14841): the host
   * words the helper's `exitCode`.
   *
   * @throws {@link AgentHostError} `sandbox_busy` while the host runs a setup or removal itself, or when the host can't be reached
   */
  async afterRemoveHelper(exitCode: number): Promise<SandboxSetupResult> {
    const route = "POST /v1/sandbox/remove/elevated";
    return readAnswer(route, await this.#transport.request(route, { exitCode }), resultSchema);
  }

  /**
   * Starts removing Halonic's WSL distro after the user's explicit choice, or
   * joins the removal that runs. With `export-then-remove` a failed backup
   * removes nothing.
   *
   * @throws {@link AgentHostError} `sandbox_busy` while a setup or another removal runs, or when the host can't be reached
   */
  async startRemoveWsl(
    choice: WslRemoveChoice,
  ): Promise<SandboxSetupStatus | { readonly inUse: number }> {
    const route = "POST /v1/sandbox/remove-wsl";
    const answer = await this.#transport.request(route, choice);
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
  async ended<V extends SandboxSetupVerb>(
    verb: V,
    options: { readonly intervalMs?: number; readonly signal?: AbortSignal } = {},
  ): Promise<Extract<FinishedSandboxSetup, { verb: V }> | undefined> {
    for (;;) {
      if (options.signal?.aborted) return undefined;
      const now = await this.status();
      if (now.running !== verb)
        return now.last?.verb === verb
          ? (now.last as Extract<FinishedSandboxSetup, { verb: V }>)
          : undefined;
      await this.#pause(options.intervalMs ?? 1000, options.signal);
    }
  }
}

/** The host answers a start with 202; read it as the 200 `readAnswer` expects. */
function accepted(answer: AgentHostAnswer): AgentHostAnswer {
  return answer.status === 202 ? { ...answer, status: 200 } : answer;
}
