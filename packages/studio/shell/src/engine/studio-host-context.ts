import { createContext, useContext } from "react";
import type { StudioHost } from "./engine-words.ts";

/**
 * Where the window runs, for what it draws deep down, such as a page that can't load its code. The
 * window gives it; without one, it is the desktop app.
 */
export const StudioHostContext = createContext<StudioHost>("desktop-app");

/** Where the window runs ({@link StudioHostContext}). */
export function useStudioHost(): StudioHost {
  return useContext(StudioHostContext);
}
