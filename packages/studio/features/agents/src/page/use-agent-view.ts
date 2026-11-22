import { useCallback, useEffect, useState } from "react";
import { forgetFreshAgent, isFreshAgent } from "./fresh-agents.ts";

export type AgentView = "flow" | "configuration" | "runs";

/**
 * The view the page shows. It opens on Flow, the agent map (flow-agents 2.2, HAL-119 U10). An
 * agent just made with nothing written opens on Configuration › Behaviour with Instructions focused
 * instead (`agents.page.new-agent`); once the person picks a view, it is a page like any other, so
 * coming back to Behaviour doesn't take the focus again.
 *
 * Each request to open at the model shows Configuration again if the person left it. The request
 * waits until Configuration has shown its Model page, so coming back to Configuration by hand later
 * opens it as usual.
 */
export function useAgentView(hubId: string, id: string, modelRequest: string | undefined) {
  const [fresh, setFresh] = useState(() => isFreshAgent(hubId, id));
  useEffect(() => forgetFreshAgent(hubId, id), [hubId, id]);
  const [view, setView] = useState<AgentView>(() =>
    isFreshAgent(hubId, id) ? "configuration" : "flow",
  );
  const [shownFor, setShownFor] = useState<string>();
  const [modelWaiting, setModelWaiting] = useState(false);
  if (modelRequest !== undefined && modelRequest !== shownFor) {
    setShownFor(modelRequest);
    setView("configuration");
    setModelWaiting(true);
  }
  const selectView = (next: AgentView) => {
    setView(next);
    setFresh(false);
  };
  const modelShown = useCallback(() => setModelWaiting(false), []);
  return { view, selectView, fresh, modelWaiting, modelShown };
}
