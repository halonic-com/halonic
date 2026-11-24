import type { Tab } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useState } from "react";
import { configurationWords } from "../configuration/configuration-words.ts";
import { mapWords } from "../map/map-words.ts";
import { forgetFreshAgent, isFreshAgent } from "./fresh-agents.ts";
import { pageWords } from "./page-words.ts";

/** The views of the agent page's panel. */
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

/**
 * The panel's views. Configuration carries the number of errors on its pages, read as
 * "Configuration, 2 errors" (`agents.configuration.error-counts`).
 */
export function agentTabs(errors: number): readonly [Tab<AgentView>, ...Tab<AgentView>[]] {
  return [
    { id: "flow", label: mapWords.tab },
    {
      id: "configuration",
      label: configurationWords.tab,
      ...(errors > 0 && {
        count: { value: errors, tone: "danger" as const, name: configurationWords.errors(errors) },
      }),
    },
    { id: "runs", label: pageWords.runsHeading },
  ];
}
