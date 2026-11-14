/**
 * The words of Settings › About Halonic: microcopy 20.3 and 20.5 as flow-install-update 4.3 and
 * the checklist (HAL-1151, part 3) quote them. The status line never repeats the version that is
 * on the line above it (V4); the announcements do. A reason is a phrase to put after a colon,
 * never error text.
 */
export const SECTION_TITLE = "About Halonic";

export const CHECK_NOW = "Check now";
export const CHECKING = "Checking…";
export const DOWNLOAD_BUSY = "Downloading…";
export const CANCEL_DOWNLOAD = "Cancel download";
export const TRY_AGAIN = "Try again";

export const AUTOMATIC = "Update Halonic automatically";
export const AUTOMATIC_SENTENCE =
  "Halonic checks for a new version once a day and downloads it in the background. It installs when you restart or quit Halonic. The check sends nothing about you or your work.";

export const VIEW_ONLY = "Updates are installed on the computer running Halonic.";

export const RELEASE_NOTES = "Release notes";
export const SOURCE_CODE = "Source code";
export const LICENCE = "Licence: Apache-2.0";
export const REPORT_A_PROBLEM = "Report a problem";

export const NOT_CHECKED = "Not checked for updates yet.";
export const AUTOMATIC_OFF_NOTE = "Automatic updates are off.";
/** The updater itself didn't answer a button; the shell's own reasons come in the status. */
export const UPDATER_DIDNT_ANSWER = "Halonic's updater didn't answer. Try again.";

export const versionHeading = (version: string) => `Halonic ${version}`;
export const upToDate = (when: string) => `Up to date. Checked ${when}.`;
export const automaticOff = (when: string | null) =>
  when === null ? AUTOMATIC_OFF_NOTE : `${AUTOMATIC_OFF_NOTE} Checked ${when}.`;
export const cantCheck = (reason: string, when: string | null) =>
  `Couldn't check for updates: ${reason}.${when === null ? "" : ` Last checked ${when}.`}`;
export const available = (version: string, current: string) =>
  `Halonic ${version} is available. You have ${current}.`;
export const downloading = (version: string, progress: string) =>
  `Downloading Halonic ${version}… ${progress}`;
export const downloadButton = (version: string) => `Download Halonic ${version}`;
export const downloadFailed = (version: string, reason: string) =>
  `Couldn't download Halonic ${version}: ${reason}. Halonic tries again at the next check.`;
export const signatureMismatch = (version: string, current: string) =>
  `Halonic ${version} was downloaded, but its signature doesn't match Halonic's. It wasn't installed, and the download was deleted. Halonic ${current} keeps working.`;
export const ready = (version: string) =>
  `Halonic ${version} is ready. It installs when you restart or quit Halonic.`;
export const didNotInstall = (version: string, current: string) =>
  `Halonic ${version} didn't install. You're still on ${current}.`;

export const checkReasons = {
  offline: "you're offline",
  "no-answer": "the update server didn't answer",
  unreadable: "the update server sent something Halonic couldn't read",
} as const;

export const downloadReasons = {
  offline: "you're offline",
  "no-answer": "the update server didn't answer",
  stalled: "the download stalled",
  disk: "there isn't enough room on the disk",
} as const;

/** What the announcer says after Check now (mc 20.5): with the version, also when nothing changed. */
export const announceUpToDate = (current: string, when: string) =>
  `Halonic ${current} is up to date. Checked ${when}.`;
export const announceCantCheck = (reason: string) => `Couldn't check for updates: ${reason}.`;
export const announceAvailable = (version: string) => `Halonic ${version} is available.`;
export const CHECKING_FOR_UPDATES = "Checking for updates";
export const downloadingName = (version: string) => `Downloading Halonic ${version}`;
