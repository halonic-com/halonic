import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/**
 * The sentences `halonic serve` gives a caller of the served workspace. They
 * leave out file names, paths and fingerprints: a caller on the network
 * learns the state of the trust, not what the workspace holds.
 */
export const serveMessages = defineMessages("serve", {
  /** The workspace is trusted on this computer, as it is now. */
  trusted: () => phrase`This workspace is trusted on this computer.`,
  /** The workspace was never trusted here. */
  trustNew: () => phrase`This workspace isn't trusted on this computer yet.`,
  /** The workspace was trusted, then changed. */
  trustChanged: () => phrase`This workspace changed since it was trusted on this computer.`,
  /** The trust record can't be read, so the workspace counts as not trusted. */
  trustUnreadable: () => phrase`The trust record on this computer can't be read.`,
  /** A file names something trust can't cover. */
  trustRefused: () => phrase`A file in this workspace names something that can't be trusted.`,
});
