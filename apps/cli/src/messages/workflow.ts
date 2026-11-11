import { printable } from "../output/printable.ts";
import { listInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";
import { countInWords } from "./words.ts";

/**
 * The sentences for a workflow someone named that isn't one workflow
 * (cli-output 3.4, the list's errors): `halonic runs --workflow` and
 * `halonic run <workflow>` share them. The workflow is named as the user
 * typed it (1.1).
 */
export const workflowMessages = defineMessages("workflow", {
  /** Line 1 when no hub has the workflow (`not_found`). */
  noWorkflow: (typed: string, workspace: string) =>
    phrase`There's no workflow called "${typed}" in ${workspace}.`,
  /** Line 2 under {@link noWorkflow}, when a workflow's id is close (cli-output 1.3). */
  workflowNear: (near: string) => phrase`Did you mean ${near}?`,
  /**
   * Line 2 under {@link noWorkflow}, when none is close: the ids there are,
   * as `init` lists its examples, since no command lists them (HAL-6007).
   * An id in several hubs shows once. An id is the author's text, so it is
   * escaped.
   * "Workflows in acme: support-reply, weekly-report.", or "acme has no workflows yet."
   */
  seeWorkflows: (workspace: string, ids: readonly string[]) => {
    const shown = [...new Set(ids)].map(printable);
    return shown.length === 0
      ? phrase`${workspace} has no workflows yet.`
      : phrase`Workflows in ${workspace}: ${shown.join(", ")}.`;
  },
  /** Line 1 when several hubs have a workflow with that id (`invalid_input`, C174). */
  inSeveralHubs: (typed: string, hubs: number) =>
    phrase`There's a workflow called "${typed}" in ${countInWords(hubs)} hubs.`,
  /** Line 2 under {@link inSeveralHubs}: "Name the hub: support/reply or sales/reply." */
  nameTheHub: (choices: readonly string[]) => phrase`Name the hub: ${listInWords(choices, "or")}.`,
});
