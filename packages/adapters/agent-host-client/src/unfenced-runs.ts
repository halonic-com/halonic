import { type Schema, s } from "@halonicjs/schema-kit";
import { AgentHostError, type AgentHostTransport, readAnswer } from "./transport.ts";

/**
 * Whether plugin code may run without the sandbox on this computer, as the
 * agent host's start gate decides it now: the engine's `UnfencedRunDecision`,
 * as codes. `reason` is one of the engine's `runnerUnfencedReasons`; Studio
 * words it, and treats a reason it has no words for as unknown.
 */
export type UnfencedRunStatus =
  | { readonly run: "fenced" }
  | { readonly run: "allowed"; readonly reason: string; readonly allowedAt: string }
  | { readonly run: "needs-yes"; readonly reason: string }
  | { readonly run: "stopped" };

const reason = s.string().min(1);
const allowedSchema = s
  .object({ run: s.literal("allowed"), reason, allowedAt: s.string().min(1) })
  .strict();
const statusSchema = s.discriminatedUnion("run", [
  s.object({ run: s.literal("fenced") }).strict(),
  allowedSchema,
  s.object({ run: s.literal("needs-yes"), reason }).strict(),
  s.object({ run: s.literal("stopped") }).strict(),
]) satisfies Schema<UnfencedRunStatus>;
const takenBackSchema = s.object({ takenBack: s.literal(true) }).strict();

/**
 * The user's yes to run plugin code without the sandbox, kept by the agent
 * host in the person's profile (HAL-3384). Only the trust check's box and
 * Take back in Settings › Agent sandbox call it: the host saves a yes only
 * for the reason that holds at that moment, and checks it again at every
 * plugin start.
 *
 * @example
 * const unfenced = new AgentHostUnfencedRuns(transport);
 * const status = await unfenced.status();
 * if (status.run === "needs-yes" && ticked) await unfenced.allow(status.reason);
 */
export class AgentHostUnfencedRuns {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /**
   * What a plugin start would decide now. Asking also lets the host remove a
   * saved yes once the computer is in the sandbox.
   *
   * @throws {@link AgentHostError} when the host can't read the status
   */
  async status(): Promise<UnfencedRunStatus> {
    const route = "GET /v1/unfenced-runs";
    return readAnswer(route, await this.#transport.request(route), statusSchema);
  }

  /**
   * Saves the user's yes for `reason`, the reason the trust check showed.
   *
   * @returns the yes as saved, or `null` when the reason changed since: nothing was saved, so read the status again
   * @throws {@link AgentHostError} when the host refuses for any other reason
   */
  async allow(reasonShown: string): Promise<Extract<UnfencedRunStatus, { run: "allowed" }> | null> {
    const route = "POST /v1/unfenced-runs/allow";
    const answer = await this.#transport.request(route, { reason: reasonShown });
    try {
      return readAnswer(route, answer, allowedSchema);
    } catch (error) {
      if (error instanceof AgentHostError && error.kind === "reason_changed") return null;
      throw error;
    }
  }

  /**
   * Takes the yes back and stops every plugin the host runs without the sandbox.
   *
   * @throws {@link AgentHostError} `take_back_incomplete` when some didn't stop (the yes is gone), or `take_back_failed`
   */
  async takeBack(): Promise<void> {
    const route = "POST /v1/unfenced-runs/take-back";
    readAnswer(route, await this.#transport.request(route, {}), takenBackSchema);
  }
}
