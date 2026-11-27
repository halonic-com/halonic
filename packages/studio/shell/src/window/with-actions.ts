import type { MenuEntry } from "@halonicjs/studio-kit";
import type { WorkspaceSwitcherProps } from "../sidebar/workspace-switcher.tsx";

/** What the window lets its workspace menu do. */
export interface WindowActions {
  /** Runs the command with this id, any feature's, and says whether a feature added it. */
  readonly runCommand: (commandId: string) => boolean;
}

/** The workspace switcher as `StudioWindow` takes it. */
export interface StudioSwitcher extends Omit<WorkspaceSwitcherProps, "menu"> {
  readonly menu: readonly MenuEntry[] | ((window: WindowActions) => readonly MenuEntry[]);
}

/** The switcher the sidebar draws: a menu given as a function is made with the window's actions. */
export function withActions(
  switcher: StudioSwitcher | undefined,
  actions: WindowActions,
): WorkspaceSwitcherProps | undefined {
  if (switcher === undefined) {
    return undefined;
  }
  const { menu } = switcher;
  return { ...switcher, menu: typeof menu === "function" ? menu(actions) : menu };
}
