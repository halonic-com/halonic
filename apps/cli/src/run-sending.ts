// Whether a CLI run's connector may send (HAL-15772): the choice a person
// saved with `halonic google allow-sending`, which the runs of `run`,
// `runs send`, `serve` and `routines watch` read at the engine's side-effect
// boundary. Sending stays off without it. A refusal goes to the model as the
// call's result, so it says how a person switches sending on, where the CLI
// can.

import type { SendingSettings } from "@halonicjs/app";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";

/**
 * The sending settings of the engine's runs on `workspace`: `saved`, the
 * choices in the profile, with the next step added to a refusal's reason.
 * For a Google connector that is the `allow-sending` command; any other
 * connector can't be switched on in the CLI yet. A refusal keeps the
 * store's error, which the engine passes to the host, never to the model.
 *
 * @example
 * const sending = runSendingSettings(openConnectionSettings(setup), workspace);
 * await sending.checkSending({ location: "/workspaces/acme", connector: "mailbox" });
 * // { allowed: false, reason: 'sending is off for the connector "mailbox": to switch it on,
 * //   run halonic google allow-sending mailbox on' }
 */
export function runSendingSettings(
  saved: SendingSettings,
  workspace: LoadedWorkspace,
): SendingSettings {
  return {
    checkSending: async (key) => {
      const check = await saved.checkSending(key);
      if (check.allowed) return check;
      return { ...check, reason: `${check.reason}: ${nextStep(workspace, key.connector)}` };
    },
  };
}

/** How a person switches sending on for `connector`, as the model may tell them. */
function nextStep(workspace: LoadedWorkspace, connector: string): string {
  const file = filesOf(workspace, "connector").find(
    (candidate) => candidate.value.id === connector,
  );
  // Only a Google connector's id from the workspace's own file goes into the command.
  if (file !== undefined && "google" in file.value.transport) {
    return `to switch it on, run halonic google allow-sending ${file.value.id} on`;
  }
  return "the CLI can't switch it on yet";
}
