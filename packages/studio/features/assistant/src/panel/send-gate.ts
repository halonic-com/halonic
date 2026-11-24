import { useToastStore } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { AssistantHost } from "../api.ts";
import { buildChatWords as words } from "../chat/build-chat-words.ts";

/** Whether the host's engine answers now, following its changes (states H12, D5). */
export function useEngineAnswering(host: AssistantHost): boolean {
  const subscribe = useCallback(
    (changed: () => void) =>
      host.onDidChange((change) => {
        if (change.kind === "engine") changed();
      }),
    [host],
  );
  return useSyncExternalStore(subscribe, () => host.engineAnswering());
}

/**
 * Whether the chat answers with the authoring tools only (states H17), asked again each time the
 * workspace's trust or the chat's model changes. `false` while it is asked, so the line never says
 * more than the host does.
 */
export function useAuthoringOnly(host: AssistantHost, chatId: string | undefined): boolean {
  const [authoringOnly, setAuthoringOnly] = useState(false);
  useEffect(() => {
    if (chatId === undefined) {
      setAuthoringOnly(false);
      return;
    }
    let current = true;
    const ask = () => {
      host.authoringOnly(chatId).then(
        (answer) => {
          if (current) setAuthoringOnly(answer);
        },
        // A chat that is gone has no line.
        () => {
          if (current) setAuthoringOnly(false);
        },
      );
    };
    ask();
    const stop = host.onDidChange((change) => {
      if (change.kind === "trust" || (change.kind === "chat" && change.chatId === chatId)) ask();
    });
    return () => {
      current = false;
      stop();
    };
  }, [host, chatId]);
  return authoringOnly;
}

/**
 * What follows a message the host refused because the workspace isn't trusted (states H16,
 * flow-assistant 5.9): the window's trust check opens, and once trusted `again` sends it. After
 * Not now, or with no check to open, `putBack` puts the message back in the box and the toast says
 * it wasn't started, with **Review** to open the check again.
 */
export function useTrustCheck(
  host: AssistantHost,
): (again: () => void, putBack: () => void) => Promise<void> {
  const toasts = useToastStore();
  return useCallback(
    async (again, putBack) => {
      const review = host.askTrust;
      if (review !== undefined && (await review()) === "trusted") {
        again();
        return;
      }
      putBack();
      toasts?.show({
        tone: "warning",
        title: words.notTrusted(host.workspaceName()),
        ...(review !== undefined && {
          action: { label: words.review, onClick: () => void review() },
        }),
      });
    },
    [host, toasts],
  );
}
