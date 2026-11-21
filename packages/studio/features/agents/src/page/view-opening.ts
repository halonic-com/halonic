import type { ItemPageSectionListing, SectionsProps } from "@halonicjs/studio-shell";
import type { ComponentType } from "react";
import type { ConfigurationStart } from "../configuration/configuration.tsx";
import { configurationWords } from "../configuration/configuration-words.ts";

/**
 * What the agent map's add buttons do: each opens Configuration on its page, Add subagent with its
 * dialog open. Add trigger is there only once a feature adds the Triggers section.
 */
export function mapAdds(
  sections: readonly ItemPageSectionListing[] | undefined,
  Sections: ComponentType<SectionsProps> | undefined,
  openConfiguration: (start: ConfigurationStart) => void,
) {
  const triggers =
    Sections === undefined ? undefined : sections?.find((each) => each.id === "triggers");
  return {
    addTrigger: triggers && (() => openConfiguration({ page: `section:${triggers.id}` })),
    addTool: () => openConfiguration({ page: "tools" }),
    addSubagent: () => openConfiguration({ page: "subagents", adding: true }),
  };
}

/** The element the view focused itself as it was drawn, such as the model picker; else none. */
export function focusedIn(box: HTMLElement | null): HTMLElement | null {
  const focused = document.activeElement;
  return box !== null && focused instanceof HTMLElement && box.contains(focused) ? focused : null;
}

/**
 * Where focus goes after an add button on the map: the Add subagent dialog's field when the dialog
 * opened, else the page Configuration opened on.
 */
export function focusAfterAdd(box: HTMLElement | null): HTMLElement | null {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused.closest("[role=dialog]") !== null) return focused;
  return pickedPageTab(box);
}

/**
 * Configuration's picked page in its page list, a control that shows where the person landed; the
 * Select stands for the list in a narrow panel.
 */
export function pickedPageTab(box: HTMLElement | null): HTMLElement | null {
  const list = `[aria-label="${configurationWords.pages}"]`;
  return (
    box?.querySelector<HTMLElement>(`${list}[role=tablist] [aria-selected="true"]`) ??
    box?.querySelector<HTMLElement>(`${list}:not([role=tablist])`) ??
    null
  );
}
