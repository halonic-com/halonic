/**
 * Where this Studio runs, which decides what it calls the engine (microcopy 1.2 and 2): the
 * desktop app starts its own engine; a Studio in a desktop browser talks to `halonic serve`; the
 * phone talks to Halonic on the user's computer.
 */
export type StudioHost = "desktop-app" | "served" | "phone";

/** The texts that say whether the engine answers, worded for one {@link StudioHost}. */
export interface EngineWords {
  /** The reason of a "Couldn't load …" state, such as "The engine isn't answering. It may still be starting." */
  readonly notAnswering: string;
  /** The line over a page that keeps what it showed, read once when the engine goes. */
  readonly showingLast: string;
  /** Read once when the engine answers again after it went. */
  readonly answeringAgain: string;
}

/**
 * The approved words for each host (microcopy 2 "States shared by every screen" and 19.2). The
 * line drops "It may still be starting", because the engine was running a moment ago.
 */
export const engineWords: Readonly<Record<StudioHost, EngineWords>> = {
  "desktop-app": {
    notAnswering: "The engine isn't answering. It may still be starting.",
    showingLast: "The engine isn't answering. Showing what it said last.",
    answeringAgain: "The engine is answering again.",
  },
  served: {
    notAnswering: "Halonic on the server isn't answering.",
    showingLast: "Halonic on the server isn't answering. Showing what it said last.",
    answeringAgain: "Halonic is answering again.",
  },
  phone: {
    notAnswering: "Halonic on your computer isn't answering.",
    showingLast: "Halonic on your computer isn't answering. Showing what it said last.",
    answeringAgain: "Halonic is answering again.",
  },
};
