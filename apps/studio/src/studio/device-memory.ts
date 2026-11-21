import type { RecentStorage, RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";

/** What this device remembers across folders: Recent, and the page's storage behind it. */
export interface DeviceMemory {
  readonly recent: RecentWorkspaces;
  readonly storage: RecentStorage;
  /** Opens the New workspace dialog; `undefined` when the window has none. */
  readonly startOwnWorkspace?: () => void;
  /** The computer's operating system; left out, the Studio's words name no program of one. */
  readonly platform?: KeyboardPlatform;
  /** Copies the demo again and opens it, for the first run's Start over; `undefined` without Open demo. */
  readonly startOver?: () => void;
}
