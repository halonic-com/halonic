import type { WorkspaceSwitcherProps } from "../sidebar/workspace-switcher.tsx";
import type { StudioSwitcher, WindowActions } from "./studio-window.tsx";

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
