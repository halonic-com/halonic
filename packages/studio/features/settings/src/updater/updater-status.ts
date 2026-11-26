/**
 * What the desktop shell tells Studio about updates. These types mirror the JSON the shell sends
 * (`update-state/src/status.rs`, flow-install-update 4.3); Settings › About Halonic, the status bar
 * item and the toasts all read this one value and word it themselves.
 */

/** Why a check got no usable answer. */
export type CheckFailure = "offline" | "no-answer" | "unreadable" | "proxy-setting" | "proxy";

/** Why a download stopped. */
export type DownloadFailure =
  | "offline"
  | "no-answer"
  | "stalled"
  | "disk"
  | "proxy-setting"
  | "proxy";

/** Where the updater is. One state per row of flow-install-update 4.3. */
export type UpdateState =
  | { readonly kind: "never-checked" }
  | { readonly kind: "up-to-date" }
  | { readonly kind: "cant-check"; readonly reason: CheckFailure }
  | {
      readonly kind: "available";
      readonly version: string;
      readonly notesUrl: string;
      /** What changed, as plain text from the update's manifest; absent when it has none. */
      readonly notes?: string;
    }
  | {
      readonly kind: "downloading";
      readonly version: string;
      readonly done: number;
      /** `null` when the server doesn't say how big the download is. */
      readonly total: number | null;
      readonly unit: "bytes";
    }
  | {
      readonly kind: "download-failed";
      readonly version: string;
      readonly reason: DownloadFailure;
    }
  | {
      readonly kind: "signature-mismatch";
      readonly version: string;
      readonly attempts: number;
    }
  | {
      readonly kind: "ready";
      readonly version: string;
      readonly notesUrl: string;
      readonly notes?: string;
    }
  | { readonly kind: "did-not-install"; readonly version: string; readonly attempts: number };

/** Another tool keeps this install up to date (Scoop): Studio downloads and installs nothing. */
export interface ManagedUpdates {
  readonly by: "scoop";
  /** What the person runs to update, shown instead of "Restart to update". */
  readonly command: string;
}

/** The update this start finished, for the "Updated to" dialog. */
export interface JustUpdated {
  readonly from: string;
  readonly to: string;
  /** The settings a migration couldn't carry over (shown by HAL-1845, not here). */
  readonly notCarriedOver: readonly string[];
  /** What changed in `to`, kept from its manifest for the "Updated to" dialog; absent when it had none. */
  readonly notes?: string;
}

/** Which builds an install updates to (HAL-18480): released versions, or every passing build. */
export type UpdateTrack = "stable" | "preview";

/** Whether `version` is a Preview build, `0.1.1-preview.42` (HAL-18308). */
export function isPreviewBuild(version: string): boolean {
  return version.includes("-preview.");
}

/**
 * The track the install follows. The shell sends it since HAL-18480; a shell that doesn't counts
 * as the build's own track, as the shell's rule for an install with no choice saved.
 */
export function trackOf(status: UpdateStatus): UpdateTrack {
  return status.track ?? (isPreviewBuild(status.current) ? "preview" : "stable");
}

/** Everything About Halonic and the status bar need, in one value. */
export interface UpdateStatus {
  /** The version that runs. */
  readonly current: string;
  /** The "Update Halonic automatically" switch. */
  readonly automatic: boolean;
  /** A check runs now; `state` still holds the last result. */
  readonly checking: boolean;
  /** When a check last got an answer, in milliseconds since 1970 (UTC), or `null` if never. */
  readonly lastChecked: number | null;
  readonly justUpdated: JustUpdated | null;
  readonly managed: ManagedUpdates | null;
  /**
   * The update found or ready raises srt's Windows setup version, so installing it asks for
   * administrator rights once more where the agent sandbox is set up (HAL-5404). Absent counts as
   * false.
   */
  readonly sandboxSetupAgain?: boolean;
  /** The track the install follows: the person's choice, or with none saved, its build's. */
  readonly track?: UpdateTrack;
  readonly state: UpdateState;
}
