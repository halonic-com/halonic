import { parse, type Schema, s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

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

/**
 * The agent sandbox's one-time setup and its removal, run by the agent host
 * for Settings › Agent sandbox (HAL-1451). Each asks Windows for
 * administrator rights once, so it can take as long as the person takes to
 * answer; the calls wait that long, and nothing here gives up early.
 */
export class AgentHostSandboxSetup {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /** @throws {@link AgentHostError} when the host refuses, or can't be reached */
  async status(): Promise<SandboxSetupStatus> {
    const route = "GET /v1/sandbox/setup";
    return readAnswer(route, await this.#transport.request(route), statusSchema);
  }

  /**
   * Sets the sandbox up, or joins the setup that runs.
   *
   * @throws {@link AgentHostError} `sandbox_busy` while a removal runs, or when the host can't be reached
   */
  async setUp(): Promise<FinishedSandboxSetup> {
    const route = "POST /v1/sandbox/setup";
    return readAnswer(route, await this.#transport.request(route, {}), finishedSchema);
  }

  /**
   * Removes the sandbox, or joins the removal that runs. While sandboxed runs
   * go on the host refuses before any prompt, and this answers how many.
   *
   * @throws {@link AgentHostError} `sandbox_busy` while a setup runs, or when the host can't be reached
   */
  async remove(): Promise<FinishedSandboxSetup | { readonly inUse: number }> {
    const route = "POST /v1/sandbox/remove";
    const answer = await this.#transport.request(route, {});
    if (answer.status === 409) {
      const inUse = parse(inUseSchema, answer.body);
      if (inUse.ok) return { inUse: inUse.value.runs };
    }
    return readAnswer(route, answer, finishedSchema);
  }
}
