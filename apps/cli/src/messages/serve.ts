import { defineMessages } from "./define.ts";
import { errorMessages, issuesLink } from "./general.ts";
import { markPart, phrase } from "./phrase.ts";

/**
 * The sentences `halonic serve` gives a caller of the served workspace. They
 * leave out file names, paths and fingerprints: a caller on the network
 * learns the state of the trust, not what the workspace holds.
 */
export const serveMessages = defineMessages("serve", {
  /** `serve`'s line in `halonic --help`. */
  summary: () => phrase`Serve the workspace to your phone or browser until you stop it`,
  /** `--network`'s line in `halonic serve --help`. */
  networkOption: () => phrase`Also open it on your home network; needs a sign-in password.`,
  /** `--port`'s line in `halonic serve --help`. */
  portOption: () => phrase`The port to listen on (default 4747; 0 lets the system choose).`,
  /** What `serve` was doing, for "✕ Couldn't serve acme: …". */
  action: (place: string) => phrase`serve ${place}`,
  /** The end of line 1 of a refusal: nothing was served. */
  nothingServed: () => phrase`Nothing was served.`,
  /** The end of line 1 when one run is refused while the server keeps serving. */
  runNotStarted: () => phrase`That run didn't start. The server is still running.`,
  /** A served run of a harness agent starts while nothing is live yet. */
  noLiveVersion: () => phrase`No version of the workspace is live yet.`,
  /** `--port` is not a port number. */
  portInvalid: () => phrase`--port needs a whole number from 0 to 65535.`,
  /**
   * After "✕ Couldn't serve Acme: ", when another program listens on the
   * port; `other` is a free-looking port next to it to try (HAL-14262).
   */
  portInUse: (port: number, other: number) =>
    phrase`port ${String(port)} is in use by another program. Stop it, or pick another port with --port ${String(other)}.`,
  /** The first line once it is listening, with how to stop. */
  serving: (workspace: string, address: string) =>
    phrase`Serving ${workspace} at ${address}. Stop with Ctrl C.`,
  /**
   * The line under {@link serving} for each webhook routine that is on, with
   * the address a web request starts it at (HAL-14299).
   */
  webhookRoutine: (name: string, address: string) =>
    phrase`${name} starts on a web request at ${address}`,
  /** The line under {@link webhookRoutine} when its secret isn't set, so every request is refused. */
  webhookSecretNotSet: (name: string, secret: string) =>
    phrase`${markPart("failed")} ${name} won't start: its secret ${secret} isn't set. Set it with: halonic secret set ${secret}`,
  /**
   * The line under {@link webhookRoutine} when its secret's name belongs to
   * Halonic or a plugin, such as `serve-password`, which the server never
   * accepts for a webhook. It doesn't say to set it: that would overwrite
   * Halonic's own secret and still not help.
   */
  webhookSecretNotOwn: (name: string, secret: string) =>
    phrase`${markPart("failed")} ${name} won't start: its secret name ${secret} belongs to Halonic or a plugin. Use a name of your own in its routine file.`,
  /**
   * The line under {@link webhookRoutine} when the routine has an error that
   * `halonic validate` reports too, such as a `{{trigger.date}}` a web request
   * has no value for, so the server refuses every signed request for it
   * (HAL-15084). `reason` is validate's own sentence.
   */
  webhookRoutineInvalid: (name: string, reason: string) =>
    phrase`${markPart("failed")} ${name} won't start: ${reason}`,
  /**
   * A signed web request the server refused with a 400 while it serves, with
   * the server's reason, so the person at the terminal sees why the webhook
   * started nothing (HAL-15084).
   */
  webhookRefused: (name: string, reason: string) =>
    phrase`${markPart("failed")} ${name} didn't start on a web request: ${reason}`,
  /**
   * The line under {@link webhookRoutine} when the routine starts an agent,
   * which the server answers with 501 until agent runs are built (HAL-15277),
   * in the words Studio's Starts card uses (microcopy 1.5 L2).
   */
  webhookRoutineAgent: (name: string) =>
    phrase`${markPart("failed")} ${name} won't start: Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow with the agent as a step, then start that.`,
  /**
   * Line 1 of a web request for a routine that failed with a 500: a bug, so
   * the error shape's F16 line 1 (microcopy 25.1 L4, HAL-15277).
   */
  webhookFailed: (name: string) =>
    phrase`${markPart("failed")} ${name} didn't start on a web request: ${errorMessages.internal().phrase}`,
  /**
   * Line 2 under {@link webhookFailed}, indented. `--debug` is a start flag, so
   * it says to start serve again; with `--debug` on, the cause is already
   * printed above it, so it only asks for the report (HAL-6613).
   */
  webhookFailedFix: (debugging: boolean) =>
    debugging
      ? phrase`  Report it with the details above: ${issuesLink}`
      : phrase`  Start halonic serve again with --debug to see the details, and report it: ${issuesLink}`,
  /** The runtime's own line with the address for the phone, as it words it. */
  address: (line: string) => phrase`${line}`,
  /** The line under {@link serving} when the sign-in password is not set, so only this computer can open it. */
  noPassword: () =>
    phrase`No sign-in password is set, so only this computer can open it. Set one with: halonic secret set serve-password`,
  /** The line under {@link serving} when the Studio page isn't built, so the address shows no page. */
  studioNotBuilt: () =>
    phrase`The Studio page isn't built, so the address shows no page yet. Build it with: pnpm --filter @halonicjs/app-studio build`,
  /** The line under {@link serving} when the built Studio page is older than its sources, such as after `git pull`. */
  studioOutdated: () =>
    phrase`The Studio page was built before its code last changed, so the address may show an older page. Build it again with: pnpm --filter @halonicjs/app-studio build`,
  /** A request failed in a way the caller isn't told about; the cause goes to `--debug`. */
  requestFailed: (reason: string) => phrase`A request failed: ${reason}`,
  /** The workspace is trusted on this computer, as it is now. */
  trusted: () => phrase`This workspace is trusted on this computer.`,
  /** The workspace reaches only the test model, so trust doesn't apply to it. */
  trustNotNeeded: () => phrase`This workspace needs no trust: it reaches only the test model.`,
  /** The workspace was never trusted here. */
  trustNew: () => phrase`This workspace isn't trusted on this computer yet.`,
  /** The workspace was trusted, then changed. */
  trustChanged: () => phrase`This workspace changed since it was trusted on this computer.`,
  /** The trust record can't be read, so the workspace counts as not trusted. */
  trustUnreadable: () => phrase`The trust record on this computer can't be read.`,
  /** A file names something trust can't cover. */
  trustRefused: () => phrase`A file in this workspace names something that can't be trusted.`,
});
