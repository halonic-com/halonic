import type { OwnerCheckAvailable } from "@halonicjs/studio-feature-remote/phone";
import type { TauriIpc } from "@halonicjs/studio-services/tauri-ipc";

/**
 * The shell's `owner_check_available` (HAL-15194): whether the phone's owner
 * check can ask right now. It takes nothing from the page. Anything but a plain
 * `true`, or a refusal, reads as no, so `risky` approvals stay on the computer;
 * a refusal also goes to the log.
 */
export function tauriOwnerCheckAvailable(
  internals: TauriIpc,
  report: (line: string) => void,
): OwnerCheckAvailable {
  return () =>
    internals.invoke("owner_check_available").then(
      (available) => available === true,
      (error: unknown) => {
        report(`owner_check_available was refused: ${String(error)}`);
        return false;
      },
    );
}
