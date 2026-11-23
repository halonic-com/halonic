import type { TauriIpc } from "@halonicjs/studio-services/tauri-ipc";

/** The Android screens the phone app's buttons open. */
export interface PhoneScreens {
  /** Android's settings page for Halonic: Open settings. */
  readonly openSettings: () => void;
  /** The Tailscale app, or its Play Store page: Open Tailscale. */
  readonly openTailscale: () => void;
}

/**
 * The shell's `phone_open_settings` and `phone_open_tailscale` (HAL-16438). They take nothing
 * from the page and answer whether the screen opened; a false answer or a refusal goes to the log,
 * and the page stays as it is.
 */
export function tauriPhoneScreens(
  internals: TauriIpc,
  report: (line: string) => void,
): PhoneScreens {
  const open = (command: string): void => {
    internals.invoke(command).then(
      (opened) => {
        if (opened !== true) report(`${command} opened nothing.`);
      },
      (error: unknown) => report(`${command} was refused: ${String(error)}`),
    );
  };
  return {
    openSettings: () => open("phone_open_settings"),
    openTailscale: () => open("phone_open_tailscale"),
  };
}
