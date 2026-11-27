import {
  type ChatAnswer,
  type ChatAnswerListener,
  type ChatAnswerRequest,
  ChatService,
} from "@halonicjs/app";
import type { RunExecutor } from "@halonicjs/ports";
import type { RefusalsFeed } from "@halonicjs/studio-feature-library/api";
import { EngineNotAnswering, isUntrustedRefusal } from "@halonicjs/studio-shell";
import type { EngineService } from "./engine-service.ts";
import { LateEngine } from "./late-engine.ts";
import { RemoteEngine } from "./remote-engine.ts";

/** Opens the executor a chat's turns go to, or throws why nothing may start now. */
export type OpenChatExecutor = () => Promise<Pick<RunExecutor, "chatTurn">>;

/**
 * Where a window's chats answer. On the page's own engine, each answer first passes the trust
 * check a start passes, so it is refused as `denied` before any model turn when the workspace may
 * start nothing now. On the background engine, each turn is the engine's `POST /api/chat-turn`,
 * which checks trust and the turn's model settings itself and refuses a workspace that isn't
 * trusted as `WorkspaceUntrusted`, as the page's engine does. On a {@link LateEngine}, each answer
 * first waits until the engine that runs it is chosen.
 */
export function chatExecutorOf(
  engine: Pick<EngineService, "openForStart"> | RemoteEngine | LateEngine,
): OpenChatExecutor {
  if (engine instanceof LateEngine) return async () => chatExecutorOf(await engine.chosen())();
  if (engine instanceof RemoteEngine) return async () => engine.chats;
  return async () => (await engine.openForStart()).executor;
}

/**
 * Answers a chat, such as an agent's Try it, on the executor `openExecutor` gives
 * ({@link chatExecutorOf}). It counts as a start, so each answer is refused as `denied` when the
 * workspace may start nothing now, before any model turn: the chat gives the agent its own
 * connectors and tools. What its turns refused and left waiting goes to the Library's `refusals`
 * list too, after the chat's own listener.
 */
export function answerChatOn(
  openExecutor: OpenChatExecutor,
  refusals?: Pick<RefusalsFeed, "record" | "recordWaiting">,
): (request: ChatAnswerRequest) => Promise<ChatAnswer> {
  return async (request) => {
    const executor = await openExecutor();
    const own = request.listener;
    const listener: ChatAnswerListener = {
      onTurn: (turn) => own?.onTurn?.(turn),
      // Only a chat that shows the text as it is written asks the model to stream it.
      ...(own?.onText !== undefined && { onText: (text) => own.onText?.(text) }),
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
    const answer = await new ChatService(executor).answer({ ...request, listener });
    if (answer.end.reason === "failed" && rejectsTheAnswer(answer.end.error)) {
      throw answer.end.error;
    }
    return answer;
  };
}

/**
 * Whether a turn's failure rejects the whole answer, as the page's engine rejects it before any
 * turn: the background engine refuses a workspace that isn't trusted, and is found gone, only on
 * a turn, inside the chat. Try it offers Review, or says the engine has gone, only for a rejection.
 */
function rejectsTheAnswer(error: Error): boolean {
  return isUntrustedRefusal(error) || error instanceof EngineNotAnswering;
}
