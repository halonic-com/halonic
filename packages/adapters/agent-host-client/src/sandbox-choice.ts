import {
  limitCodes,
  type SandboxBackendId,
  type SandboxChoice,
  sandboxBackendIds,
  sandboxBackendStates,
  trustCheckFailures,
} from "@halonicjs/app";
import { sandboxUnavailableReasons } from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import { type AgentHostAnswer, type AgentHostTransport, readAnswer } from "./transport.ts";

const backendId = s.enum(sandboxBackendIds);
const limit = s.enum(limitCodes);

const backendSchema = s
  .object({
    id: backendId,
    offered: s.boolean(),
    state: s.enum(sandboxBackendStates),
    reason: s
      .union([
        s.enum(sandboxUnavailableReasons),
        s.enum(trustCheckFailures),
        s.literal("download-needed"),
      ])
      .nullable(),
    setup: s.literal("download").nullable(),
    missing: s.array(s.string()),
    limits: s.array(limit),
    residuals: s.array(limit),
    securityUpdatesLast: s.string().nullable().optional(),
  })
  .strict();

const settingSchema = s.union([
  s.object({ backend: backendId, chosenAt: s.string() }).strict(),
  s.object({ backend: s.literal("none"), chosenAt: s.string(), appVersion: s.string() }).strict(),
]);

const choiceSchema = s
  .object({
    active: s.union([backendId, s.literal("none")]).nullable(),
    setting: settingSchema.nullable(),
    backends: s.array(backendSchema),
  })
  .strict();

/**
 * The choice an answer holds. The schema lists the same closed codes as the engine's type, but
 * can't say `securityUpdatesLast` is left out rather than `undefined`, which the type says.
 */
function readChoice(route: string, answer: AgentHostAnswer): SandboxChoice {
  return readAnswer(route, answer, choiceSchema) as SandboxChoice;
}

/**
 * The shell's call that saves the person's sandbox choice in the profile, or removes it for `null`,
 * and answers with the host's answer to choosing again (`agent_host_sandbox_choice_save`). A
 * backend the shell refuses rejects with an {@link AgentHostError}.
 */
export type SandboxChoiceSave = (
  backend: SandboxBackendId | "none" | null,
) => Promise<AgentHostAnswer>;

const choiceRoute = "GET /v1/sandbox/choice";
const settingsChangedRoute = "POST /v1/sandbox/choice/settings-changed";

/**
 * The page's way to ask the agent host which sandbox runs (HAL-10796). The host
 * chooses from the setting the shell saved in the profile; nothing here sends a
 * setting to the host, so a page can't pick a backend by calling it. Saving goes
 * through the shell (`saveChoice`), which checks the backend and writes the
 * profile itself. The answer is codes, as the engine's `SandboxChoiceService`
 * makes them: the page words them.
 */
export class AgentHostSandboxChoice {
  readonly #transport: AgentHostTransport;
  readonly #saveChoice: SandboxChoiceSave;

  constructor(transport: AgentHostTransport, saveChoice: SandboxChoiceSave) {
    this.#transport = transport;
    this.#saveChoice = saveChoice;
  }

  /**
   * The latest choice. The host's first answer runs the trust check, so it can take a moment.
   *
   * @throws {@link AgentHostError} `sandbox_choice_failed` when the host can't read the saved setting, `answer_invalid` for an answer of another shape, or when the host can't be reached
   */
  async choice(): Promise<SandboxChoice> {
    return readChoice(choiceRoute, await this.#transport.request(choiceRoute));
  }

  /**
   * Chooses again, after the shell saved or removed the setting.
   *
   * @throws {@link AgentHostError} as {@link AgentHostSandboxChoice.choice}
   */
  async settingsChanged(): Promise<SandboxChoice> {
    return readChoice(
      settingsChangedRoute,
      await this.#transport.request(settingsChangedRoute, {}),
    );
  }

  /**
   * Saves `backend` as the person's choice, or removes the choice for `null`, and answers the
   * choice after it. Asking the person to confirm `"none"` happens before this call, on the page.
   *
   * @throws {@link AgentHostError} with the shell's kind (`invalid_choice`, `io`, ...) when it refuses the save, or as {@link AgentHostSandboxChoice.choice} for the host's answer
   */
  async save(backend: SandboxBackendId | "none" | null): Promise<SandboxChoice> {
    // The shell answers with the host's answer to choosing again.
    return readChoice(settingsChangedRoute, await this.#saveChoice(backend));
  }
}
