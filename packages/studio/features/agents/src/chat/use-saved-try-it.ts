import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AgentRef, AgentsHost } from "../api.ts";
import { loadTryIt, newTryItId, saveTryIt } from "./saved-try-it.ts";
import type { Transcript } from "./transcript.ts";

/** What {@link useSavedTryIt} gives the Try it chat. */
export interface SavedTryItChat {
  /** Saves the chat as it is now; the Try it chat calls it when a turn ends. */
  readonly save: () => void;
}

/**
 * Keeps one agent's Try it chat in the host's saved chats ({@link AgentsHost.savedChats}): when the
 * page opens, the agent's most recent chat comes back, unless the person already sent something,
 * and {@link SavedTryItChat.save} saves the chat in `current`, in the order the turns ended. Where
 * the host keeps no chats, it does nothing.
 *
 * A chat that can't be read or saved costs only its history, so the failure is logged and the chat
 * goes on.
 */
export function useSavedTryIt(
  host: AgentsHost,
  agent: AgentRef,
  current: { current: Transcript },
  show: (transcript: Transcript) => void,
): SavedTryItChat {
  const place = host.savedChats;
  const { hubId, id } = agent;
  const chatId = useRef<string | undefined>(undefined);
  const saving = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (place === undefined) return;
    let open = true;
    loadTryIt(place, { hubId, id }).then(
      (found) => {
        if (!open || found === undefined || current.current.turns.length > 0) return;
        chatId.current = found.id;
        current.current = found.transcript;
        show(found.transcript);
      },
      (error: unknown) => console.error("Reading the saved Try it chat", error),
    );
    return () => {
      open = false;
    };
  }, [place, hubId, id, current, show]);

  const save = useCallback(() => {
    if (place === undefined) return;
    const now = new Date();
    chatId.current ??= newTryItId(now);
    const chat = {
      id: chatId.current,
      agent: { hubId, id },
      conversation: current.current.conversation,
      now,
    };
    saving.current = saving.current
      .then(() => saveTryIt(place, chat))
      .catch((error: unknown) => console.error("Saving the Try it chat", error));
  }, [place, hubId, id, current]);

  return useMemo(() => ({ save }), [save]);
}
