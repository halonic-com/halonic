import type { AgentToolList } from "../api.ts";

/**
 * The Library's commands that open it on a tab (`library.skill` and so on); the Agents feature
 * can't import the Library, so it runs them by id.
 */
export const libraryTabCommands: Readonly<Record<AgentToolList, string>> = {
  skills: "library.skill",
  knowledge: "library.knowledge",
  connectors: "library.connector",
};
