import { Button, Callout, ExternalLink, Switch, ViewOnlyLine } from "@halonicjs/studio-kit";
import { type SettingsSectionProps, ShellError } from "@halonicjs/studio-shell";
import { type UpdaterHost, UpdaterService } from "../api.ts";
import { type AboutAction, type AboutProgress, aboutView } from "./about-state.ts";
import * as text from "./about-text.ts";
import { useUpdater } from "./use-updater.ts";

const repository = "https://github.com/halonic-com/halonic";

/** Settings › About Halonic as the settings container shows it. Without an updater it only says so. */
export function AboutSection({ context }: SettingsSectionProps) {
  const host = hostOf(context);
  if (host === undefined) return <ViewOnlyAbout />;
  return <AboutHostView host={host} announce={(line) => context.announcer.announce(line)} />;
}

/** The props of {@link AboutHostView}. */
export interface AboutHostViewProps {
  readonly host: UpdaterHost;
  /** Says a result of Check now: the settings container's live region. */
  readonly announce: (line: string) => void;
}

/** The section over an updater: the status line, its buttons, the automatic switch and the links. */
export function AboutHostView({ host, announce }: AboutHostViewProps) {
  const updater = useUpdater(host, announce);
  const { status } = updater;
  if (status === null) return <AboutLinks heading={null} />;
  const view = aboutView(status, new Date());
  const checking = status.checking;
  const version = "version" in status.state ? status.state.version : "";
  const buttons: Record<AboutAction, { label: string; run: () => void }> = {
    download: { label: text.downloadButton(version), run: updater.download },
    cancel: { label: text.CANCEL_DOWNLOAD, run: updater.cancel },
    "try-again": { label: text.TRY_AGAIN, run: updater.download },
  };
  return (
    <div className="mt-2 flex max-w-120 flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-body font-medium">{text.versionHeading(status.current)}</h3>
          {view.callout ? null : <p className="text-small text-fg-muted">{view.line}</p>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          busy={checking}
          busyLabel={text.CHECKING}
          onClick={updater.checkNow}
        >
          {text.CHECK_NOW}
        </Button>
      </div>
      {view.callout ? (
        <Callout tone="warning">
          {view.line}{" "}
          <ExternalLink href={`${repository}/issues/new`}>{text.REPORT_A_PROBLEM}</ExternalLink>
        </Callout>
      ) : null}
      {view.progress ? <DownloadBar progress={view.progress} /> : null}
      {updater.unanswered ? (
        <p className="text-small text-fg-muted">{text.UPDATER_DIDNT_ANSWER}</p>
      ) : null}
      {view.actions.length === 0 && view.notesUrl === null ? null : (
        <div className="flex flex-wrap items-center gap-3">
          {view.actions.map((action) => (
            <Button key={action} variant="secondary" size="sm" onClick={buttons[action].run}>
              {buttons[action].label}
            </Button>
          ))}
          {view.notesUrl === null ? null : (
            <ExternalLink href={view.notesUrl}>{text.RELEASE_NOTES}</ExternalLink>
          )}
        </div>
      )}
      {status.managed === null ? (
        <Switch checked={status.automatic} onChange={updater.setAutomatic}>
          <span className="flex flex-col">
            <span>{text.AUTOMATIC}</span>
            <span className="text-small text-fg-muted">{text.AUTOMATIC_SENTENCE}</span>
          </span>
        </Switch>
      ) : null}
      <AboutLinks heading={status.current} />
    </div>
  );
}

/** The progress bar: 4px, at most 360px wide; the numbers are in the line above, so no label of its own. */
function DownloadBar({ progress }: { readonly progress: AboutProgress }) {
  const known = progress.fraction !== null;
  return (
    <div
      role="progressbar"
      aria-label={progress.name}
      aria-valuemin={0}
      aria-valuemax={known ? 100 : undefined}
      aria-valuenow={known ? Math.round(progress.fraction * 100) : undefined}
      aria-valuetext={progress.valueText}
      className="h-1 w-full max-w-90 overflow-hidden rounded-full bg-surface-muted"
    >
      <div
        className="h-full bg-primary"
        style={{ width: `${known ? Math.round(progress.fraction * 100) : 100}%` }}
      />
    </div>
  );
}

/** The four links, as links to pages outside Studio. */
function AboutLinks({ heading }: { readonly heading: string | null }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small" aria-label={text.SECTION_TITLE}>
      <li>
        <ExternalLink
          href={`${repository}/releases/${heading === null ? "latest" : `tag/v${heading}`}`}
        >
          {text.RELEASE_NOTES}
        </ExternalLink>
      </li>
      <li>
        <ExternalLink href={repository}>{text.SOURCE_CODE}</ExternalLink>
      </li>
      <li>
        <ExternalLink href={`${repository}/blob/main/LICENSE`}>{text.LICENCE}</ExternalLink>
      </li>
      <li>
        <ExternalLink href={`${repository}/issues/new`}>{text.REPORT_A_PROBLEM}</ExternalLink>
      </li>
    </ul>
  );
}

function ViewOnlyAbout() {
  return (
    <div className="mt-2 flex max-w-120 flex-col gap-5">
      <ViewOnlyLine>{text.VIEW_ONLY}</ViewOnlyLine>
      <AboutLinks heading={null} />
    </div>
  );
}

/** The app's updater, or none when the app gives none (served Studio). */
function hostOf(context: SettingsSectionProps["context"]): UpdaterHost | undefined {
  try {
    return context.services.get(UpdaterService);
  } catch (error) {
    // Only "the feature doesn't list it" means no host; anything else is a bug to surface.
    if (error instanceof ShellError) return undefined;
    throw error;
  }
}
