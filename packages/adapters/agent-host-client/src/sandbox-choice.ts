import {
  limitCodes,
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
 * The page's way to ask the agent host which sandbox runs (HAL-10796). The host
 * chooses from the setting the shell saved in the profile; nothing here sends a
 * setting, so a page can't pick a backend by calling it. The answer is codes, as
 * the engine's `SandboxChoiceService` makes them: the page words them.
 */
export class AgentHostSandboxChoice {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /**
   * The latest choice. The host's first answer runs the trust check, so it can take a moment.
   *
   * @throws {@link AgentHostError} `sandbox_choice_failed` when the host can't read the saved setting, `answer_invalid` for an answer of another shape, or when the host can't be reached
   */
  async choice(): Promise<SandboxChoice> {
    const route = "GET /v1/sandbox/choice";
    return readChoice(route, await this.#transport.request(route));
  }

  /**
   * Chooses again, after the shell saved or removed the setting.
   *
   * @throws {@link AgentHostError} as {@link AgentHostSandboxChoice.choice}
   */
  async settingsChanged(): Promise<SandboxChoice> {
    const route = "POST /v1/sandbox/choice/settings-changed";
    return readChoice(route, await this.#transport.request(route, {}));
  }
}
