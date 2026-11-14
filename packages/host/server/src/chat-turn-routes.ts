import {
  type ChatAgentSettings,
  type ChatMessage,
  type ChatParams,
  type ChatTurnRequest,
  isHalonicSecretName,
  isPluginSecretName,
  isSecretName,
  type ToolDefinition,
} from "@halonicjs/ports";
import type { ModelSettingsGate, ServerPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { isJsonRequest } from "./run-routes.ts";
import { refuseUnlessTrusted } from "./trust-routes.ts";

/** `POST /api/chat-turn`: one model turn outside any run. */
export const chatTurnPath = "/api/chat-turn";

export interface ChatTurnRoutes {
  /**
   * Forwards the turn to the executor and answers its response. The request's
   * own `signal` goes to the executor, so a caller that closes the request
   * stops the model call.
   */
  chatTurn(request: Request, body: Uint8Array): Promise<Response>;
}

type ChatTurnRoutePorts = Pick<ServerPorts, "runs" | "trust" | "modelSettings" | "errorLog">;

/** The longest id, alias or name the routes accept, in UTF-8 bytes. */
const maxTextBytes = 256;

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isShortText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    new TextEncoder().encode(value).length <= maxTextBytes
  );
}

/** Whether `value` has no key outside `allowed`: an unknown key is a mistake or an attempt, never ignored. */
function hasOnly(value: Fields, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isOptional<T>(value: unknown, check: (value: unknown) => value is T): boolean {
  return value === undefined || check(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isToolCall(value: unknown): boolean {
  return (
    isFields(value) &&
    hasOnly(value, ["id", "name", "arguments", "signature"]) &&
    isShortText(value["id"]) &&
    isShortText(value["name"]) &&
    isFields(value["arguments"]) &&
    isOptional(value["signature"], isText)
  );
}

function isReplay(value: unknown): boolean {
  return isFields(value) && hasOnly(value, ["type", "data"]) && isShortText(value["type"]);
}

function isMessage(value: unknown): value is ChatMessage {
  if (!isFields(value) || !isText(value["content"])) return false;
  switch (value["role"]) {
    case "system":
    case "user":
      return hasOnly(value, ["role", "content"]);
    case "assistant":
      return (
        hasOnly(value, ["role", "content", "toolCalls", "replay"]) &&
        (value["toolCalls"] === undefined ||
          (Array.isArray(value["toolCalls"]) && value["toolCalls"].every(isToolCall))) &&
        (value["replay"] === undefined || isReplay(value["replay"]))
      );
    case "tool":
      return (
        hasOnly(value, ["role", "content", "toolCallId", "name"]) &&
        isShortText(value["toolCallId"]) &&
        isShortText(value["name"])
      );
    default:
      return false;
  }
}

function isTool(value: unknown): value is ToolDefinition {
  return (
    isFields(value) &&
    hasOnly(value, ["name", "description", "parameters"]) &&
    isShortText(value["name"]) &&
    isText(value["description"]) &&
    isFields(value["parameters"])
  );
}

function isParams(value: unknown): value is ChatParams {
  return (
    isFields(value) &&
    hasOnly(value, ["temperature", "topP", "maxTokens", "stop", "reasoningEffort", "extra"]) &&
    isOptional(value["temperature"], isNumber) &&
    isOptional(value["topP"], isNumber) &&
    isOptional(value["maxTokens"], isNumber) &&
    (value["stop"] === undefined ||
      (Array.isArray(value["stop"]) && value["stop"].every(isText))) &&
    (value["reasoningEffort"] === undefined ||
      ["low", "medium", "high"].includes(value["reasoningEffort"] as string)) &&
    (value["extra"] === undefined || isFields(value["extra"]))
  );
}

/**
 * Unsaved model settings. They name the secret that holds the API key and
 * never carry the key: a field that isn't listed, such as `apiKey`, refuses
 * the whole request, so a key typed into the wrong place never reaches a log.
 */
function isAgentSettings(value: unknown): value is ChatAgentSettings {
  return (
    isFields(value) &&
    hasOnly(value, ["type", "model", "baseUrl", "secret", "local"]) &&
    isShortText(value["type"]) &&
    isShortText(value["model"]) &&
    typeof value["local"] === "boolean" &&
    isOptional(value["baseUrl"], isText) &&
    isOptional(value["secret"], isText)
  );
}

/**
 * Whether a model setting may use this secret name. The host looks the name
 * up and sends its value to `baseUrl`, so a name of Halonic's own (the
 * sign-in password's hash) or a plugin's would send it to a server of the
 * caller's choice.
 */
function mayUseSecret(name: string | undefined): boolean {
  return (
    name === undefined ||
    (isSecretName(name) && !isHalonicSecretName(name) && !isPluginSecretName(name))
  );
}

/** Whether the workspace allows the turn's settings: only settings that name a secret are asked. */
async function mayUseAddress(
  modelSettings: ModelSettingsGate,
  turn: ChatTurnRequest,
): Promise<boolean> {
  return turn.agent?.secret === undefined || (await modelSettings.allows(turn.hubId, turn.agent));
}

/** The request the body asks for, built from the listed fields only, or `null` when the body isn't one. */
function parseChatTurn(body: Uint8Array): ChatTurnRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
  if (
    !isFields(parsed) ||
    !hasOnly(parsed, ["hubId", "alias", "messages", "tools", "agentId", "params", "agent"])
  ) {
    return null;
  }
  const { hubId, alias, messages, tools, agentId, params, agent } = parsed;
  if (
    !isShortText(hubId) ||
    !isOptional(alias, isShortText) ||
    !isOptional(agentId, isShortText) ||
    !Array.isArray(messages) ||
    !messages.every(isMessage) ||
    !Array.isArray(tools) ||
    !tools.every(isTool) ||
    !(params === undefined || isParams(params)) ||
    !(agent === undefined || isAgentSettings(agent))
  ) {
    return null;
  }
  const request: ChatTurnRequest = { hubId, messages, tools };
  if (alias !== undefined) request.alias = alias as string;
  if (agentId !== undefined) request.agentId = agentId as string;
  if (params !== undefined) request.params = params as ChatParams;
  if (agent !== undefined) request.agent = agent as ChatAgentSettings;
  return request;
}

export function createChatTurnRoutes({
  runs,
  trust,
  modelSettings,
  errorLog,
}: ChatTurnRoutePorts): ChatTurnRoutes {
  return {
    async chatTurn(request, body) {
      if (!isJsonRequest(request)) {
        return errorResponse(serverErrors.unsupportedMediaType);
      }
      const turn = parseChatTurn(body);
      if (turn === null) {
        return errorResponse(serverErrors.badRequest);
      }
      if (!mayUseSecret(turn.agent?.secret)) {
        return errorResponse(serverErrors.secretNameNotAllowed);
      }
      // The host sends the secret to the address, so a pair its workspace didn't set up goes nowhere.
      if (!(await mayUseAddress(modelSettings, turn))) {
        return errorResponse(serverErrors.modelAddressNotAllowed);
      }
      // The executor runs the tools a turn calls, so a chat turn needs trust just like a start.
      const refusal = await refuseUnlessTrusted(trust);
      if (refusal !== null) {
        return refusal;
      }
      try {
        return Response.json(await runs.chatTurn({ ...turn, signal: request.signal }));
      } catch (error) {
        // A caller that closed the request gets no answer, and the abort isn't a fault to log.
        if (request.signal.aborted) {
          return errorResponse(serverErrors.requestAborted);
        }
        // The cause may name a host or quote the provider, so it goes to the log, not to the caller.
        errorLog.record(error);
        return errorResponse(serverErrors.modelCallFailed);
      }
    },
  };
}
