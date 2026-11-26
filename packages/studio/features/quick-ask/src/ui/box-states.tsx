import { EmptyState } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import type { AskWindow } from "../api.ts";
import { quickAskWords } from "../quick-ask-words.ts";

/** Brings Studio's window forward, for **Open Studio**; a refusal is logged. */
function openStudio(window: AskWindow): void {
  window.openStudio().catch((error: unknown) => {
    console.error("Quick ask couldn't bring Studio's window forward:", error);
  });
}

/** No agent to ask yet: "No agents yet", with **Open Studio** to connect a workspace or a team. */
export function NoAgents({ window }: { readonly window: AskWindow }) {
  return (
    <div className="p-6">
      <EmptyState
        title={quickAskWords.noAgents}
        description={quickAskWords.noAgentsHint}
        action={{ label: quickAskWords.openStudio, onClick: () => openStudio(window) }}
      />
    </div>
  );
}

/**
 * The agents couldn't be read (design HAL-19384): the kit's Empty state in its error look, in the
 * same frame as "No agents yet", with **Try again**, which reads them again, and **Open Studio**.
 * The text typed so far stays in the box's state and comes back with the text box. The title takes
 * the focus as it shows: the text box it replaces had it, so a screen reader reads the error out,
 * and Esc still reaches the box instead of falling to the page.
 */
export function LoadFailed({
  window,
  onTryAgain,
}: {
  readonly window: AskWindow;
  readonly onTryAgain: () => void;
}) {
  const title = useRef<HTMLElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  return (
    <div className="p-6">
      <EmptyState
        tone="error"
        titleRef={title}
        title={quickAskWords.loadFailed}
        description={quickAskWords.loadFailedHint}
        action={{ label: quickAskWords.tryAgain, onClick: onTryAgain }}
        link={{ label: quickAskWords.openStudio, onClick: () => openStudio(window) }}
      />
    </div>
  );
}
