import type { RemoteControl } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * The host's {@link RemoteControl}, on loopback. The app provides it once the host has a pairing
 * service (task B2); until then nothing does, and Studio shows no Remote section.
 */
export const RemoteControlService: ServiceKey<RemoteControl> =
  serviceKey<RemoteControl>("remote.control");

/**
 * What Settings › Remote's "Keep this computer awake while it's plugged in" needs of the desktop
 * shell: its `keep_awake_set` command, which holds the system's sleep lock only while both
 * switches are on and the computer is plugged in. Only the desktop app's main window gives it;
 * served Studio and the phone don't, so the row doesn't show there (`remote.keep-awake`).
 */
export interface KeepAwakeHost {
  /**
   * Tells the shell the setting and remote's state, and answers whether the lock is held now.
   *
   * @throws Error when the shell refuses: it couldn't hold the lock, and its log says why
   */
  set(keep: boolean, remote: boolean): Promise<boolean>;
}

/** The desktop shell's sleep lock, where the app has one. */
export const KeepAwakeService: ServiceKey<KeepAwakeHost> =
  serviceKey<KeepAwakeHost>("remote.keep-awake");
