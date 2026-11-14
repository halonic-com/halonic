import type { UpdateStatus } from "./updater-status.ts";

/**
 * What About Halonic, the status bar item and the restart dialog need of the updater. The app
 * gives it where Halonic runs as the desktop app; without it About shows only the view-only line
 * (flow-install-update 4.2). Every method but `status` and `subscribe` acts only because the
 * person pressed a button: nothing here checks or downloads by itself.
 */
export interface UpdaterHost {
  /** The status now. */
  status(): Promise<UpdateStatus>;
  /**
   * Calls `listener` with the status now and each time it changes. A download reports at most
   * twice a second. Returns the function that stops it.
   */
  subscribe(listener: (status: UpdateStatus) => void): () => void;
  /** "Check now": answers when the check ends. */
  check(): Promise<UpdateStatus>;
  /** "Download Halonic 0.1.1" and "Try again". */
  download(): Promise<UpdateStatus>;
  /** "Cancel download": stops it and keeps nothing. */
  cancel(): Promise<UpdateStatus>;
  /** "Restart to update". Refused when `managed` is set. */
  restart(): Promise<void>;
  /** The "Update Halonic automatically" switch. */
  setAutomatic(on: boolean): Promise<UpdateStatus>;
}
