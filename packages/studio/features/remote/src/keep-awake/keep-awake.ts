import { type HostSettings, hostSetting } from "@halonicjs/app";
import type { RemoteControl } from "@halonicjs/ports";
import type { KeepAwakeHost } from "../api.ts";
import { followRemote } from "../remote-state.ts";

/** "Keep this computer awake while it's plugged in": off until the person turns it on. */
export const keepAwakeSetting = hostSetting(
  "remote.keep-awake",
  false,
  (value): value is boolean => typeof value === "boolean",
);

/**
 * Tells the shell the setting and remote's state from the start, and again whenever remote turns
 * on or off or another window or the CLI changes the setting, until the function it gives back is
 * called. Settings › Remote tells the shell its own changes itself: `HostSettings` doesn't report
 * a save made through it. A refusal goes to `report`; the shell's log already says why.
 */
export function followKeepAwake(
  settings: HostSettings,
  remote: RemoteControl,
  host: KeepAwakeHost,
  report: (error: unknown) => void = (error) => console.error("Keeping this computer awake", error),
): () => void {
  let remoteOn: boolean | undefined;
  const send = (): void => {
    if (remoteOn === undefined) return;
    host.set(settings.get(keepAwakeSetting), remoteOn).catch(report);
  };
  const stopRemote = followRemote(
    remote,
    (state) => {
      // The state changes with every phone and tunnel check; only on and off matter here.
      if (state.on === remoteOn) return;
      remoteOn = state.on;
      send();
    },
    (error) => {
      if (error !== undefined) report(error);
    },
  );
  const stopSettings = settings.onChange((keys) => {
    if (keys.includes(keepAwakeSetting.key)) send();
  });
  return () => {
    stopRemote();
    stopSettings();
  };
}

/**
 * Settings › Remote's change of the switch: tells the shell first, so a refusal saves nothing,
 * then saves the setting. When the save fails, the shell goes back to the saved setting.
 *
 * @throws the shell's refusal or the save's error; the switch then stays as it was
 */
export async function changeKeepAwake(
  settings: HostSettings,
  host: KeepAwakeHost,
  keep: boolean,
  remoteOn: boolean,
): Promise<void> {
  await host.set(keep, remoteOn);
  try {
    await settings.set(keepAwakeSetting, keep);
  } catch (error) {
    await host
      .set(settings.get(keepAwakeSetting), remoteOn)
      .catch((undo: unknown) => console.error("Putting keep-awake back", undo));
    throw error;
  }
}
