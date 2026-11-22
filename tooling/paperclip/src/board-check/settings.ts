/**
 * The board check's settings, as the board saves them in the plugin's
 * settings. Only the board can change a plugin's settings, so the switch
 * that lets the job write is board-only.
 */

export interface BoardCheckSettings {
  /** The Board Checker's task: its two documents live there, and an ask wakes it there. */
  readonly boardCheckerTaskId: string | undefined;
  /**
   * The plugin version the board allowed to write, or undefined. Writes are on
   * only while this equals the running version, so every install and upgrade
   * starts with writes off until the board enters the new version.
   */
  readonly writesForVersion: string | undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Reads the board check's part of a company's settings; anything odd counts as unset. */
export function readBoardCheckSettings(
  config: Readonly<Record<string, unknown>>,
): BoardCheckSettings {
  return {
    boardCheckerTaskId: text(config["boardCheckerTask"]),
    writesForVersion: text(config["boardCheckWritesForVersion"]),
  };
}

/** Whether the board turned writes on for exactly this version of the plugin. */
export function writesOn(settings: BoardCheckSettings, version: string): boolean {
  return settings.writesForVersion === version;
}
