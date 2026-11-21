import {
  type ChatAnswer,
  type ChatAnswerListener,
  type ChatAnswerRequest,
  ChatService,
} from "@halonicjs/app";
import type { RefusalsFeed } from "@halonicjs/studio-feature-library/api";
import type { EngineService } from "./engine-service.ts";

/**
 * Answers a chat, such as an agent's Try it, on the engine's executor. It counts as a start, so
 * each answer is refused as `denied` when the workspace may start nothing now, before any model
 * turn: the chat gives the agent its own connectors and tools. What its turns refused and left
 * waiting goes to the Library's `refusals` list too, after the chat's own listener.
 */
export function answerChatOn(
  engine: Pick<EngineService, "openForStart">,
  refusals?: Pick<RefusalsFeed, "record" | "recordWaiting">,
): (request: ChatAnswerRequest) => Promise<ChatAnswer> {
  return async (request) => {
    const { executor } = await engine.openForStart();
    const own = request.listener;
    const listener: ChatAnswerListener = {
      onTurn: (turn) => own?.onTurn?.(turn),
      onToolCall: (toolCall) => own?.onToolCall?.(toolCall),
      onMessage: (message) => own?.onMessage?.(message),
      onRefusals: (refused) => {
        own?.onRefusals?.(refused);
        refusals?.record(refused);
      },
      onWaiting: (waiting) => {
        own?.onWaiting?.(waiting);
        refusals?.recordWaiting(waiting);
      },
    };
    return new ChatService(executor).answer({ ...request, listener });
  };
}
