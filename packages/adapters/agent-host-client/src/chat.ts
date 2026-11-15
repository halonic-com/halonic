import type { ChatRequest, ChatResponse } from "@halonicjs/ports";
import { s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const answerSchema = s
  .object({
    content: s.string(),
    reasoning: s.string().optional(),
    toolCalls: s.array(s.unknown()),
    usage: s.object({ inputTokens: s.number(), outputTokens: s.number() }).passthrough(),
    finishReason: s.enum(["stop", "tool_calls", "length", "error", "other"]),
  })
  .passthrough();

/**
 * The page's way to run one chat call on a workspace provider. The page has
 * no way to reach a model itself, so the agent host makes the call. The page
 * names the provider by its id and sends only text and sampling settings:
 * the host takes the address and the key from its own copy of the workspace,
 * and refuses a provider that doesn't run on this computer.
 */
export class AgentHostChat {
  readonly #transport: AgentHostTransport;
  readonly #workspaceRoot: string;

  /** @param workspaceRoot the folder of the open workspace, which the host must have been given */
  constructor(transport: AgentHostTransport, workspaceRoot: string) {
    this.#transport = transport;
    this.#workspaceRoot = workspaceRoot;
  }

  /**
   * @returns the provider's answer
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`provider_not_on_this_machine`, `unknown_provider`, `provider_type_unsupported`, `request_too_large`, `too_many_chats`, `model_failed`), or answers something else
   */
  async chat(provider: string, request: ChatRequest): Promise<ChatResponse> {
    const route = "POST /v1/models/chat";
    // Only what the host takes goes: no tools, no `meta`, no signal.
    const { model, messages, params, responseFormat } = request;
    const answer = await this.#transport.request(
      route,
      {
        workspaceRoot: this.#workspaceRoot,
        provider,
        request: {
          model,
          messages,
          ...(params === undefined
            ? {}
            : {
                params: {
                  ...(params.maxTokens === undefined ? {} : { maxTokens: params.maxTokens }),
                  ...(params.temperature === undefined ? {} : { temperature: params.temperature }),
                },
              }),
          ...(responseFormat === undefined ? {} : { responseFormat }),
        },
      },
      request.signal === undefined ? undefined : { signal: request.signal },
    );
    return readAnswer(route, answer, answerSchema) as ChatResponse;
  }
}
