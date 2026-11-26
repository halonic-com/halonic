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
  /** `--public-origin`'s line in `halonic serve --help`. */
  publicOriginOption: () =>
    phrase`The https address a proxy on this computer serves it at; needs a sign-in password.`,
  /** `--public-origin` isn't an https origin. */
  publicOriginInvalid: () =>
    phrase`--public-origin needs an https address with no path, such as https://engine.example.com.`,
  /** `--public-origin` and `--network` were both given. */
  publicOriginWithNetwork: () =>
    phrase`--public-origin can't go with --network: the proxy on this computer is the only way in.`,
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
  /** For the log: the serve's Paperclip connectors were asked to build another kind of connector. */
  notPaperclipConnector: (id: string) => phrase`Connector "${id}" isn't a Paperclip connector.`,
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
  /**
   * The line in place of {@link webhookRoutine} when a ✕ line follows it: the
   * address only, so it doesn't promise a start the ✕ line takes back (C570).
   */
  webhookRoutineAddress: (name: string, address: string) =>
    phrase`${name} has the web address ${address}`,
  /** The line under {@link webhookRoutine} when its secret isn't set, so every request is refused. */
  webhookSecretNotSet: (name: string, secret: string) =>
    phrase`${markPart("failed")} ${name} can't start: its secret ${secret} isn't set. Set it with: halonic secret set ${secret}`,
  /**
   * The line under {@link webhookRoutine} when its secret's name belongs to
   * Halonic or a plugin, such as `serve-password`, which the server never
   * accepts for a webhook. It doesn't say to set it: that would overwrite
   * Halonic's own secret and still not help.
   */
  webhookSecretNotOwn: (name: string, secret: string) =>
    phrase`${markPart("failed")} ${name} can't start: its secret name ${secret} belongs to Halonic or a plugin. Use a name of your own in its routine file.`,
  /**
   * The line under {@link webhookRoutine} when the routine has an error that
   * `halonic validate` reports too, such as a `{{trigger.date}}` a web request
   * has no value for, so the server refuses every signed request for it
   * (HAL-15084). `reason` is validate's own sentence.
   */
  webhookRoutineInvalid: (name: string, reason: string) =>
    phrase`${markPart("failed")} ${name} can't start: ${reason}`,
  /**
   * A signed web request the server refused with a 400 while it serves, with
   * the server's reason, so the person at the terminal sees why the webhook
   * started nothing (HAL-15084).
   */
  webhookRefused: (name: string, reason: string) =>
    phrase`${markPart("failed")} ${name} didn't start on a web request: ${reason}`,
  /**
   * A signed web request that started a run while it serves, with the run's
   * short id, so the terminal shows that the webhook worked (C570).
   */
  webhookStarted: (name: string, runId: string) =>
    phrase`${markPart("done")} ${name} started on a web request ${markPart("separator")} run ${runId}`,
  /**
   * A signed web request that started nothing because a run of the routine
   * is still going and its `overlap` is `skip` (C570).
   */
  webhookSkipped: (name: string) =>
    phrase`${name} skipped a web request: its previous run is still going (overlap: skip).`,
  /**
   * The line under {@link webhookRoutine} when the routine starts an agent,
   * which the server answers with 501 until agent runs are built (HAL-15277),
   * in the words Studio's Starts card uses (microcopy 1.5 L2).
   */
  webhookRoutineAgent: (name: string) =>
    phrase`${markPart("failed")} ${name} can't start: Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow with the agent as a step, then have the routine start that workflow.`,
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
  /** One finished request in the serve log: method, path and status only (HAL-19106). */
  request: (method: string, path: string, status: number) => phrase`${method} ${path} ${status}`,
  /** Written to the debug log when a Paperclip key the server couldn't store couldn't be revoked either. */
  paperclipKeyNotRevoked: () =>
    phrase`The Paperclip sign-in failed after the approval, and its key couldn't be revoked. Revoke it in Paperclip.`,
  /** Written to the debug log when Paperclip didn't cancel an ended sign-in's challenge, so its key gets revoked instead. */
  paperclipChallengeNotCancelled: () =>
    phrase`Paperclip didn't cancel an ended sign-in's challenge, so its key is revoked instead.`,
  /** Written to the debug log when the key of an ended or refused sign-in couldn't be revoked. */
  paperclipSignInKeyNotRevoked: () =>
    phrase`The key of an ended Paperclip sign-in couldn't be revoked, so it may work until it expires. Revoke it in Paperclip.`,
  /** The line under {@link serving} when the sign-in password is not set, so only this computer can open it. */
  noPassword: () =>
    phrase`No sign-in password is set, so only this computer can open it. Set one with: halonic secret set serve-password`,
  /** Why `serve` didn't start: a Paperclip key is stored for a connection and no sign-in password is set. */
  paperclipNeedsPassword: () =>
    phrase`Serving a Paperclip connection needs a sign-in password, so nobody else can act with its key. Set one with: halonic secret set serve-password`,
  /** The line under {@link serving} when the Studio page isn't built, so the address shows no page. */
  studioNotBuilt: () =>
    phrase`The Studio page isn't built, so the address shows no page yet. Build it with: pnpm --filter @halonicjs/app-studio build`,
  /**
   * The line under {@link serving} from the npm package, which doesn't ship the Studio page, and
   * the page a browser gets at the address then: the way in is the Android app (HAL-19285). A phone
   * reaches only an address served with `--network` or `--public-origin` (`reachable`), so
   * without one the line says to serve with `--network` first.
   */
  studioNotInPackage: (reachable: boolean) =>
    reachable
      ? phrase`Open it from the Halonic app for Android: run halonic serve pair to add it. The Studio page for a browser doesn't come with the npm package.`
      : phrase`The Studio page for a browser doesn't come with the npm package. To open it from the Halonic app for Android, serve it with halonic serve --network, then run halonic serve pair.`,
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
  /**
   * Continue in a served window refused: choice files it would commit have changes of their own
   * that aren't committed, so it saves nothing (HAL-16248). `files` are the workspace paths.
   */
  choiceFilesNotCommitted: (files: readonly string[]) =>
    phrase`Couldn't save: ${listed(files)} ${files.length === 1 ? "has" : "have"} changes that aren't committed. Commit or undo them, then try again.`,
  /** The message of the commit Continue makes in a served window, so the history shows where it came from. */
  choiceCommit: () => phrase`Save the model picked through halonic serve`,
  /** For the log: saving the choice files failed, and putting them back failed too. */
  choiceUndoFailed: () => phrase`Saving the model choice failed, and so did undoing it.`,
  /** For the log, should anything ask the served model choice to grant trust (HAL-14808, D2). */
  choiceNoTrust: () =>
    phrase`Trust a workspace on the computer that serves it, with halonic trust.`,
});

/** "a", "a and b", "a, b and c". */
function listed(items: readonly string[]): string {
  const last = items.at(-1) ?? "";
  return items.length < 2 ? last : `${items.slice(0, -1).join(", ")} and ${last}`;
}
