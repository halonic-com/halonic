// The Build chat's turn in a workspace that isn't trusted (`studio.assistant-authoring-turn`,
// flow-assistant 5.9, HAL-720, HAL-17335): the person's own Settings › Assistant model, offered
// the authoring tools and nothing else. It opens no engine, so it takes no engine lock and starts
// no routine, scheduler, harness, watcher or connector, and it reads no workspace file: the model
// comes from the device's settings alone. The tools run in the page, as every Build chat's do
// (`ChatService`), where they keep to the untrusted rules (`assistant.build.read-limits`).

import { deviceModel } from "@halonicjs/adapter-workspace-models";
import { noListedToolApproval, runModelTurn } from "@halonicjs/engine";
import type {
  ChatTurnRequest,
  ChatTurnResponse,
  Clock,
  HttpClient,
  KeyOrigins,
  RunExecutor,
  Secrets,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";

/** The authoring tools, the only ones a turn before trust offers (HAL-720 condition 6). */
export const authoringToolNames: readonly string[] = [
  "list_files",
  "read_file",
  "schema",
  "validate",
  "propose_file",
  "propose_delete",
];

/** What {@link authoringChatExecutor} calls the model with. */
export interface AuthoringTurnParts {
  readonly secrets: Secrets;
  readonly keyOrigins: KeyOrigins;
  /** The shell's HTTP client, which checks every address and keeps the key off another origin. */
  readonly http: HttpClient;
  readonly clock: Clock;
  /** The workspace's `privacy.localOnly`, which can only narrow the models called. */
  readonly localOnly: boolean;
}

/** The name a turn's model calls carry. */
const assistantAgent = "assistant";

/**
 * The executor of a Build chat's turns before trust. Each turn is refused as `denied`, before
 * any model call, unless it is on the Settings › Assistant model (`agent`, no alias, no agent of
 * the workspace, no params) and offers exactly the authoring tools. A caller tool is handed back
 * to the chat, never run here, and nothing else is offered: no Halonic, memory, knowledge or
 * connector tool.
 */
export function authoringChatExecutor(parts: AuthoringTurnParts): Pick<RunExecutor, "chatTurn"> {
  return {
    async chatTurn(request: ChatTurnRequest): Promise<ChatTurnResponse> {
      const agent = request.agent;
      if (agent === undefined || !isAuthoringTurn(request)) {
        throw new KindedError(
          "denied",
          "Before trust, the assistant answers only on your own model, with its authoring tools.",
        );
      }
      const { secrets, keyOrigins, http, clock, localOnly } = parts;
      return runModelTurn({
        model: await deviceModel(agent, { secrets, keyOrigins, http, localOnly }),
        secrets,
        messages: request.messages,
        callerTools: request.tools,
        halonicTools: [],
        connectors: [],
        listedToolApproval: noListedToolApproval,
        // Every tool is the caller's, so a turn hands its calls back after its first model call,
        // and the chat counts the answer's calls against its own limit. The loop checks the limit
        // before it hands calls back, so 1 would drop them.
        maxRounds: 2,
        agent: assistantAgent,
        clock,
        localOnly,
        ...(request.onText === undefined ? {} : { onText: request.onText }),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
    },
  };
}

/** Whether the turn names nothing of the workspace's and offers exactly the authoring tools. */
function isAuthoringTurn(request: ChatTurnRequest): boolean {
  if (request.alias !== undefined || request.agentId !== undefined) return false;
  if (request.params !== undefined) return false;
  const names = request.tools.map((tool) => tool.name);
  return (
    names.length === authoringToolNames.length &&
    authoringToolNames.every((name) => names.includes(name))
  );
}
