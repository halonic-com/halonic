import { type SyncDiagnostics, syncConnections, syncSources } from "@halonicjs/ports";
import { Button, sizeText } from "@halonicjs/studio-kit";
import { type SyncDiagnosticsReader, SyncDiagnosticsService } from "@halonicjs/studio-services";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { type ReactNode, useEffect, useState } from "react";
import * as words from "./sync-diagnostics-words.ts";

/** Settings › Sync diagnostics as the settings container shows it, over the engine's counters. */
export function SyncDiagnosticsSection({ context }: SettingsSectionProps) {
  const reader = context.services.find(SyncDiagnosticsService);
  return reader === undefined ? null : <SyncDiagnosticsView reader={reader} />;
}

/**
 * The sync's counts and timings, read when the section opens and when the person asks again
 * (`connections.sync-diagnostics`). Read only: nothing here changes how the sync works. A failed
 * read goes to the console with its error, so it is reported, not only shown.
 */
export function SyncDiagnosticsView({ reader }: { readonly reader: SyncDiagnosticsReader }) {
  const [shown, setShown] = useState<SyncDiagnostics | "failed">();
  // Read again counts up `attempt`, which runs the effect again.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    reader.read().then(
      (read) => {
        if (current) setShown(read);
      },
      (error: unknown) => {
        console.error("Settings › Sync diagnostics couldn't read the counters", error);
        if (current) setShown("failed");
      },
    );
    return () => {
      current = false;
    };
  }, [reader, attempt]);
  const readAgain = () => setAttempt((count) => count + 1);

  if (shown === undefined) return null;
  if (shown === "failed") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p key={attempt} role="alert" className="m-0 text-danger">
          {words.READ_FAILED}
        </p>
        <Button variant="secondary" onClick={readAgain}>
          {words.TRY_AGAIN}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="m-0">{words.CONNECTION[shown.connection]}</p>
      <Rows heading={words.ARRIVED} rows={arrivedRows(shown)} />
      <Rows heading={words.TIMING} rows={timingRows(shown)} />
      <CallsTable diagnostics={shown} />
      <Button variant="secondary" onClick={readAgain}>
        {words.READ_AGAIN}
      </Button>
    </div>
  );
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

/** A heading and its label–value rows, as a description list. */
function Rows({ heading, rows }: { readonly heading: string; readonly rows: [string, string][] }) {
  return (
    <section aria-label={heading} className="flex w-full flex-col gap-2">
      <h3 className="m-0 text-label uppercase text-fg-muted">{heading}</h3>
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
function CallsTable({ diagnostics }: { readonly diagnostics: SyncDiagnostics }) {
  return (
    <section aria-label={words.CALLS} className="flex w-full flex-col gap-2">
      <h3 className="m-0 text-label uppercase text-fg-muted">{words.CALLS}</h3>
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
                    className={`py-1 pe-3 font-normal text-fg-muted ${index === 0 ? "text-start" : "text-end"}`}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diagnostics.routes.map((route) => (
                <tr key={`${route.method} ${route.route}`} className="border-t border-border">
                  <th scope="row" className="py-1 pe-3 text-start font-normal font-mono break-all">
                    {`${route.method} ${route.route}`}
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

function msOrDash(ms: number | null): string {
  return ms === null ? "–" : words.msText(ms);
}
