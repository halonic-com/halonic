import type { RunVersion } from "@halonicjs/events";
import { useTooltip } from "@halonicjs/studio-kit";
import { versionLine } from "./version-line.ts";

/** The props of `RunVersionLine`. */
export interface RunVersionLineProps {
  /** What the run's `run.started` records; absent for a run from before the log recorded it. */
  readonly version: RunVersion | undefined;
  /** Decides whether the version was made today, so the line gives the time alone. */
  readonly now: Date;
}

const lineClasses = "text-small text-fg-muted";

/**
 * One line of secondary text under the run's title that says what the run ran
 * (`runs.run-view.live-or-saved`). Not a badge, and never an error: "Version not recorded." has no
 * icon and no error colour. Only a run on the live version has a tooltip, with its commit.
 *
 * @example
 * <RunVersionLine version={started.version} now={new Date()} />
 */
export function RunVersionLine({ version, now }: RunVersionLineProps) {
  const line = versionLine(version, now);
  if (line.tooltip === undefined) {
    return <p className={lineClasses}>{line.text}</p>;
  }
  return <LineWithTooltip text={line.text} tooltip={line.tooltip} />;
}

/** The tooltip is rendered beside the line, not in it: a `<p>` can't hold its `<div>`. */
function LineWithTooltip({ text, tooltip }: { readonly text: string; readonly tooltip: string }) {
  const { anchor, trigger, popover } = useTooltip({ text: tooltip });
  return (
    <>
      <p className={lineClasses}>
        <span {...anchor} {...trigger}>
          {text}
        </span>
      </p>
      {popover}
    </>
  );
}
