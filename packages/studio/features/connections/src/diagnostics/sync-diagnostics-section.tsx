import { type SyncDiagnostics, syncConnections, syncSources } from "@halonicjs/ports";
import { Button, sizeText } from "@halonicjs/studio-kit";
import { type SyncDiagnosticsReader, SyncDiagnosticsService } from "@halonicjs/studio-services";
import {
  type SettingsSectionProps,
  type SettingsSurface,
  sectionHeadingLevel,
} from "@halonicjs/studio-shell";
import { type ReactNode, useEffect, useId, useState } from "react";
import * as words from "./sync-diagnostics-words.ts";

/** Settings › Sync diagnostics as the settings container shows it, over the engine's counters. */
export function SyncDiagnosticsSection({ context, surface }: SettingsSectionProps) {
  const reader = context.services.find(SyncDiagnosticsService);
  return reader === undefined ? null : <SyncDiagnosticsView reader={reader} surface={surface} />;
}

/** The 24 hours the section's line names; a shorter window says since when it counts. */
const DAY_MS = 24 * 60 * 60_000;

/** `h4` under the section's `h3` title in the Settings dialog, `h2` under the phone page's `h1`. */
type HeadingLevel = ReturnType<typeof sectionHeadingLevel>;

/**
 * The sync's counts and timings, read when the section opens and when the person asks again
 * (`connections.sync-diagnostics`). Read only: nothing here changes how the sync works. A failed
 * read goes to the console with its error, so it is reported, not only shown.
 */
export function SyncDiagnosticsView({
  reader,
  surface,
}: {
  readonly reader: SyncDiagnosticsReader;
  readonly surface?: SettingsSurface | undefined;
}) {
  const { shown, attempt, reading, readAgain } = useDiagnosticsRead(reader);
  const button = (label: string) => (
    <Button variant="secondary" busy={reading} busyLabel={words.READING} onClick={readAgain}>
      {label}
    </Button>
  );

  if (shown === undefined) return button(words.READ_AGAIN);
  if (shown === "failed") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p key={attempt} role="alert" className="m-0 text-danger">
          {words.READ_FAILED}
        </p>
        {button(words.TRY_AGAIN)}
      </div>
    );
  }
  const level = sectionHeadingLevel(surface);
  return (
    <div className="flex flex-col items-start gap-4">
      {shown.windowMs < DAY_MS && (
        <p className="m-0 text-fg-muted">{words.countedSince(shown.windowMs)}</p>
      )}
      <p className="m-0">{words.CONNECTION[shown.connection]}</p>
      <Rows level={level} heading={words.ARRIVED} rows={arrivedRows(shown)} />
      <Rows level={level} heading={words.TIMING} rows={timingRows(shown)} />
      <CallsTable level={level} diagnostics={shown} />
      {button(words.READ_AGAIN)}
    </div>
  );
}

/** What the view shows, and Read again: the latest read, which read it is and whether one runs. */
function useDiagnosticsRead(reader: SyncDiagnosticsReader) {
  const [shown, setShown] = useState<SyncDiagnostics | "failed">();
  // Read again counts up `attempt`, which runs the effect again.
  const [attempt, setAttempt] = useState(0);
  // The button shows "Reading…" until the read ends, so a press that brings the same numbers
  // still shows it did something. The read gives up on a host that doesn't answer.
  const [reading, setReading] = useState(true);
  useEffect(() => {
    let current = true;
    reader
      .read()
      .then(
        (read) => {
          if (current) setShown(read);
        },
        (error: unknown) => {
          console.error("Settings › Sync diagnostics couldn't read the counters", error);
          if (current) setShown("failed");
        },
      )
      .finally(() => {
        if (current) setReading(false);
      });
    return () => {
      current = false;
    };
  }, [reader, attempt]);
  const readAgain = () => {
    setReading(true);
    setAttempt((count) => count + 1);
  };
  return { shown, attempt, reading, readAgain };
}

function arrivedRows(diagnostics: SyncDiagnostics): [string, string][] {
  return syncSources.map((source): [string, string] => {
    const { count, share } = diagnostics.updates[source];
    return [words.SOURCES[source], words.countLine(count, share)];
  });
}

function timingRows(diagnostics: SyncDiagnostics): [string, string][] {
  return [
    [words.POLL_DELAY, words.delayLine(diagnostics.pollLag)],
    [words.EVENT_DELAY, words.delayLine(diagnostics.eventLag)],
    [words.MISSED, String(diagnostics.missedByEvents)],
    [words.RECONNECTS, String(diagnostics.reconnects)],
    ...syncConnections.map((state): [string, string] => [
      words.TIME_IN[state],
      words.spanText(diagnostics.timeIn[state]),
    ]),
  ];
}

/** A part's heading, one level under the section's title, and the id that names the part. */
function PartHeading({
  level,
  id,
  children,
}: {
  readonly level: HeadingLevel;
  readonly id: string;
  readonly children: string;
}) {
  const Heading = `h${level}` as const;
  return (
    <Heading id={id} className="m-0 text-label uppercase text-fg-muted">
      {children}
    </Heading>
  );
}

/** A heading and its label–value rows, as a description list. */
function Rows({
  level,
  heading,
  rows,
}: {
  readonly level: HeadingLevel;
  readonly heading: string;
  readonly rows: [string, string][];
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex w-full flex-col gap-2">
      <PartHeading level={level} id={headingId}>
        {heading}
      </PartHeading>
      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1">
        {rows.map(([label, value]) => (
          <Row key={label} label={label} value={value} />
        ))}
      </dl>
    </section>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="m-0 text-end tabular-nums">{value}</dd>
    </>
  );
}

/** Each Paperclip call by its route, with how often it ran and failed, how long it took and what it read. */
function CallsTable({
  level,
  diagnostics,
}: {
  readonly level: HeadingLevel;
  readonly diagnostics: SyncDiagnostics;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex w-full flex-col gap-2">
      <PartHeading level={level} id={headingId}>
        {words.CALLS}
      </PartHeading>
      {diagnostics.routes.length === 0 ? (
        <p className="m-0 text-fg-muted">{words.NO_CALLS}</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-small">
            <thead>
              <tr>
                {words.CALL_COLUMNS.map((column, index) => (
                  <th
                    key={column}
                    scope="col"
                    className={`py-1 font-normal text-fg-muted ${columnClass(index)}`}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diagnostics.routes.map((route) => (
                <tr key={`${route.method} ${route.route}`} className="border-t border-border">
                  <th
                    scope="row"
                    className="py-1 pe-3 text-start font-normal font-mono [overflow-wrap:anywhere]"
                  >
                    {route.method} <RouteText route={route.route} />
                  </th>
                  <td className="py-1 pe-3 text-end tabular-nums">{route.count}</td>
                  <td className="py-1 pe-3 text-end tabular-nums">{route.failed}</td>
                  <td className="py-1 pe-3 text-end tabular-nums">{msOrDash(route.p50Ms)}</td>
                  <td className="py-1 pe-3 text-end tabular-nums">{msOrDash(route.p95Ms)}</td>
                  <td className="py-1 text-end tabular-nums">{sizeText(route.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The first column starts, the numbers end; the last one has no gap after it, as its cells. */
function columnClass(index: number): string {
  const side = index === 0 ? "text-start" : "text-end";
  return index === words.CALL_COLUMNS.length - 1 ? side : `${side} pe-3`;
}

/** A route that breaks after its slashes when the table is narrow, not inside a word. */
function RouteText({ route }: { readonly route: string }) {
  const parts = route.split("/");
  return parts.flatMap((part, index) => {
    if (index === parts.length - 1) return [part];
    // The route up to this slash is unique within it, so it names the break.
    const upToHere = parts.slice(0, index + 1).join("/");
    return [`${part}/`, <wbr key={upToHere} />];
  });
}

function msOrDash(ms: number | null): string {
  return ms === null ? "–" : words.msText(ms);
}
