import { engineWords } from "@halonicjs/studio-shell";
import { createContext, useContext } from "react";

/** What a control that can't act says beside it: the sentence for this window's host. */
const NotAnswering = createContext(engineWords["desktop-app"].reason);

/** Gives the Google setup the host's "isn't answering" sentence, e.g. "Halonic on your computer isn't answering.". */
export const NotAnsweringProvider = NotAnswering.Provider;

/** The sentence to show where the setup can't act because the engine isn't answering. */
export function useNotAnswering(): string {
  return useContext(NotAnswering);
}
