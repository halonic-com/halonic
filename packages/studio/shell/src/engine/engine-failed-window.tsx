import { EmptyState, ExternalLink } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import { copyDetailsWords } from "../errors/copy-details-words.ts";
import { ShellFrame } from "../frame/shell-frame.tsx";
import { useCopyDetails } from "../page/copy-details.ts";
import type { Shell } from "../shell.ts";
import { appName } from "../window/window-title.ts";
import type { EngineConnectionEvent } from "./engine-connection.ts";
import { engineFailedWords } from "./engine-failed-words.ts";
import type { EngineStartFailure } from "./engine-start.ts";

/** The update that has just been installed, for the first start after it (microcopy 22 F1b). */
export interface JustUpdated {
  /** The version now installed, such as `0.1.1`. */
  readonly newVersion: string;
  /** The version before the update, such as `0.1.0`. */
  readonly oldVersion: string;
  /** The old version's release page, an `http` or `https` address. */
  readonly releasePageUrl: string;
}

/** Props for {@link EngineFailedWindow}. */
export interface EngineFailedWindowProps {
  /** The window's announcer, close stack, engine and toasts. */
  readonly shell: Shell;
  /** The language of the Studio's words, such as `en`, set on `<html lang>`. */
  readonly language: string;
  /** Starts the engine again from attempt 1: the `retry` of the supervisor `supervise` returned. */
  readonly onTryAgain: () => void;
  /** Set only on the first start after an update; later starts show the plain window. */
  readonly justUpdated?: JustUpdated | undefined;
  /**
   * The engine's last log lines, already scrubbed by the engine. They go to Copy details only,
   * never on the window.
   */
  readonly engineLog?: readonly string[] | undefined;
}

/**
 * The full window shown in place of Welcome or Home when the engine didn't start (microcopy 22
 * F1, F1b and F18): the reason, the line that nothing in the workspaces changed, **Try again** and
 * **Copy details**. It has no sidebar, tabs or status bar items, so nothing on it is a dead
 * control. Focus goes to the title and one assertive announcement reads the title and the reason.
 *
 * **Try again** shows the button's busy state until the engine answers or fails again. The window
 * draws nothing once the engine is answering, so the app's own Welcome or Home takes its place.
 * The app shows it only in the desktop app; a served browser or a phone shows each page's own
 * "Couldn't load …" state instead.
 *
 * @example
 * <EngineFailedWindow shell={shell} language="en" onTryAgain={supervisor.retry} />
 */
export function EngineFailedWindow({
  shell,
  language,
  onTryAgain,
  justUpdated,
  engineLog,
}: EngineFailedWindowProps) {
  const status = useEngineStatus(shell.engine);
  const [retrying, setRetrying] = useState(false);
  const remembered = useRef<EngineStartFailure | undefined>(undefined);
  const failure = lastFailure(status, remembered);
  useEffect(() => {
    // A new outcome ends the wait: connected closes the window, a new failure shows it again.
    if (status.state === "failed" || status.state === "connected") {
      setRetrying(false);
    }
  }, [status]);
  useEffect(() => {
    document.title = appName;
  }, []);
  if (failure === undefined || status.state === "connected") {
    return null;
  }
  return (
    <ShellFrame
      announcer={shell.announcer}
      closeStack={shell.closeStack}
      engine={shell.engine}
      toasts={shell.toasts}
      language={language}
    >
      <FailedContent
        failure={failure}
        busy={retrying}
        justUpdated={justUpdated}
        engineLog={engineLog}
        announcer={shell.announcer}
        onTryAgain={() => {
          setRetrying(true);
          onTryAgain();
        }}
      />
    </ShellFrame>
  );
}

/** The failure to show: the current one, or the last one while the engine starts again. */
function lastFailure(
  status: EngineConnectionEvent,
  remembered: { current: EngineStartFailure | undefined },
): EngineStartFailure | undefined {
  if (status.state === "failed") {
    remembered.current = status.failure;
  }
  return remembered.current;
}

function FailedContent({
  failure,
  busy,
  justUpdated,
  engineLog,
  announcer,
  onTryAgain,
}: {
  readonly failure: EngineStartFailure;
  readonly busy: boolean;
  readonly justUpdated: JustUpdated | undefined;
  readonly engineLog: readonly string[] | undefined;
  readonly announcer: Announcer;
  readonly onTryAgain: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const copyDetails = useCopyDetails();
  const reason = engineFailedWords.reasons[failure.reason];
  useEffect(() => {
    // Not while Try again waits; when it fails again the window reads out its reason once more.
    if (!busy) {
      titleRef.current?.focus();
      announcer.announce(engineFailedWords.announcement(reason), "assertive");
    }
  }, [announcer, reason, busy]);
  return (
    <EmptyState
      tone="error"
      titleRef={titleRef}
      title={engineFailedWords.title}
      description={
        <>
          <span className="block">{reason}</span>
          <span className="block">{engineFailedWords.reassurance}</span>
          {justUpdated === undefined ? null : <JustUpdatedLine update={justUpdated} />}
        </>
      }
      action={{ label: engineFailedWords.tryAgain, onClick: onTryAgain, busy }}
      link={{
        label: copyDetailsWords.label,
        onClick: () => void copyDetails(detailsOfFailure(failure, engineLog)),
      }}
    />
  );
}

/** The kit's `ExternalLink` throws on anything but http or https, which would blank this window. */
function isWebAddress(address: string): boolean {
  try {
    const { protocol } = new URL(address);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function JustUpdatedLine({ update }: { readonly update: JustUpdated }) {
  return (
    <span className="mt-2 block">
      {engineFailedWords.justUpdated(update.newVersion, update.oldVersion)}
      {isWebAddress(update.releasePageUrl) ? (
        <>
          {" "}
          <ExternalLink href={update.releasePageUrl}>
            {engineFailedWords.openReleasePage}
          </ExternalLink>
        </>
      ) : null}
    </span>
  );
}

/** What Copy details puts on the clipboard: the reason, the exit code and the engine's log lines. */
function detailsOfFailure(
  failure: EngineStartFailure,
  engineLog: readonly string[] | undefined,
): string {
  const exit = failure.exitCode === undefined ? [] : [`Exit code: ${failure.exitCode ?? "signal"}`];
  return [`${engineFailedWords.title}: ${failure.reason}`, ...exit, ...(engineLog ?? [])].join(
    "\n",
  );
}

/** The engine's last `engine.connection` event, kept up to date. */
function useEngineStatus(engine: Shell["engine"]): EngineConnectionEvent {
  const subscribe = useCallback(
    (onChange: () => void) => engine.on("engine.connection", onChange),
    [engine],
  );
  return useSyncExternalStore(subscribe, () => engine.status);
}
