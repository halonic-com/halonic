import { type ActionShell, TauriActionSender } from "@halonicjs/adapter-action-send-tauri";
import { type ServiceRegistry, serviceKey } from "@halonicjs/app";
import type { ActionRecords } from "@halonicjs/ports";
import { type ActionSteps, createActionSteps, desktopOnlyActionSteps } from "./action-steps.ts";
import { TauriChannel } from "./tauri-channel.ts";
import { tauriChannelIpc } from "./tauri-ipc.ts";

/** The app service the stepper screen runs a request's steps with. */
export const actionStepsKey = serviceKey<ActionSteps>("platform.action-steps");

/**
 * Gives a workspace's services the {@link ActionSteps} the stepper screen
 * calls. In the desktop app they run each step through the shell's
 * `action_*` commands ({@link TauriActionSender}) and write to `records`.
 * Outside it, in a browser, they are `desktopOnlyActionSteps`, which run
 * nothing: the screen then says "Open it in the desktop app to run it."
 * This is the only place that imports the adapter (architecture note on
 * HAL-17491, 4.3).
 *
 * @param services - the services of the workspace that is opening
 * @param page - the page's global object, usually `window`
 * @param records - where each request's record is kept, outside every workspace
 * @returns whether steps can run here
 * @throws ServiceError when the key is already provided
 *
 * @example
 * provideActionSteps(scope.services, window, records);
 * await scope.services.get(actionStepsKey).runStep("req-1", step);
 */
export function provideActionSteps(
  services: Pick<ServiceRegistry, "provide">,
  page: object,
  records: ActionRecords,
): boolean {
  const ipc = tauriChannelIpc(page);
  if (ipc === undefined) {
    services.provide(actionStepsKey, desktopOnlyActionSteps);
    return false;
  }
  const shell: ActionShell = {
    invoke: (command, args) => ipc.invoke(command, args),
    openChannel: (onMessage) => new TauriChannel(ipc, onMessage),
  };
  const sender = new TauriActionSender(shell);
  services.provide(actionStepsKey, createActionSteps({ sender, records, now: () => new Date() }));
  return true;
}
