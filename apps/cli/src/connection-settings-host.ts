// The one way a command opens each connection's settings on this computer:
// the profile's `connections` folder, so `halonic google` and the Studio
// read and write the same files.

import { FileConnectionSettingsStore } from "@halonicjs/adapter-fs-node";
import { ConnectionSettings } from "@halonicjs/app";
import {
  connectionSettingsFolder,
  type ProfileEnvironment,
  profileFolder,
} from "@halonicjs/profile";
import { type Clock, systemClock } from "@halonicjs/std";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

/** What the connection commands use on this computer, so tests can fix the profile folder and the clock. */
export interface ConnectionSetup {
  /** Where the profile folder is; this process's by default. */
  readonly profile?: ProfileEnvironment;
  /** The system clock by default. */
  readonly clock?: Clock;
}

/**
 * The connection settings over the profile's `connections` folder. Nothing
 * is created until a setting is saved.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't an absolute folder
 */
export function openConnectionSettings(setup: ConnectionSetup): ConnectionSettings {
  const profile = setup.profile ?? nodeProfileEnvironment();
  return new ConnectionSettings({
    store: new FileConnectionSettingsStore(connectionSettingsFolder(profileFolder(profile))),
    clock: setup.clock ?? systemClock,
  });
}
