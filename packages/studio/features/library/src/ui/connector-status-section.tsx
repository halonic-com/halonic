import { EmptyState, SkeletonBar, StatusChip } from "@halonicjs/studio-kit";
import { errorMessageFor } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { type ConnectionState, connectionStateTable } from "../connection-state.ts";
import { type ConnectorStatusModel, refusalLimit } from "../connector-status-model.ts";
import { refusalLine } from "../refusal-line.ts";
import { statusWords } from "../status-words.ts";

/** Props for {@link ConnectorStatusSection}. */
export interface ConnectorStatusSectionProps {
  readonly model: ConnectorStatusModel;
  /** Reads a state change to screen readers (`announcer.announceState`); without it nothing is read. */
  readonly announceState?: (key: string, text: string) => void;
}

/**
 * One connector's status, for the connector page to put under its `h1`: the state as a word
 * with the sentence that says why, then "Recent refusals" as a plain list of text lines. It is
 * a plain `div`, with no landmark of its own: the shell owns the landmarks.
 */
export function ConnectorStatusSection({ model, announceState }: ConnectorStatusSectionProps) {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const state = useSyncExternalStore(subscribe, () => model.state);
  const headingId = useId();
  useAnnounceStateChanges(model.connectorId, state.connector, announceState);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {state.loaded && state.error !== undefined ? (
        <p className="text-small text-fg-muted">{statusWords.engineLost}</p>
      ) : null}
      {state.connector === undefined ? null : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <StatusChip tone={connectionStateTable[state.connector.state].tone}>
            {connectionStateTable[state.connector.state].label}
          </StatusChip>
          {state.connector.reason === undefined ? null : (
            <p className="min-w-0 text-body [overflow-wrap:anywhere]">{state.connector.reason}</p>
          )}
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-2">
        <h2 id={headingId} className="text-heading [overflow-wrap:anywhere]">
          {statusWords.refusalsHeading}
        </h2>
        <Refusals
          headingId={headingId}
          loaded={state.loaded}
          error={state.error}
          lines={state.refusals.map(refusalLine)}
          retry={() => void model.refresh()}
        />
      </div>
    </div>
  );
}

/** Reads a change of the connector's state once; the first state shown is not a change. */
function useAnnounceStateChanges(
  connectorId: string,
  connector: { readonly name: string; readonly state: ConnectionState } | undefined,
  announceState: ((key: string, text: string) => void) | undefined,
): void {
  const previous = useRef<ConnectionState | undefined>(undefined);
  const state = connector?.state;
  const name = connector?.name;
  useEffect(() => {
    if (state !== undefined && name !== undefined) {
      if (previous.current !== undefined && previous.current !== state) {
        announceState?.(
          `connector:${connectorId}`,
          statusWords.stateChanged(name, connectionStateTable[state].label),
        );
      }
      previous.current = state;
    }
  }, [connectorId, name, state, announceState]);
}

/** Loading, can't load, nothing refused, or the list: the empty text shows only after a real zero-row answer. */
function Refusals({
  headingId,
  loaded,
  error,
  lines,
  retry,
}: {
  readonly headingId: string;
  readonly loaded: boolean;
  readonly error: unknown;
  readonly lines: readonly string[];
  readonly retry: () => void;
}) {
  if (!loaded && error !== undefined) {
    const reason = errorMessageFor(error, { title: statusWords.loadFailed }).body.trim();
    return (
      <EmptyState
        tone="error"
        align="start"
        headingLevel={3}
        title={statusWords.loadFailed}
        description={reason === "" ? statusWords.notAnswering : reason}
        action={{ label: statusWords.tryAgain, onClick: retry }}
      />
    );
  }
  if (!loaded) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 px-4 py-3">
        <span className="sr-only">{statusWords.loading}</span>
        <SkeletonBar kind="title" width="2/3" />
        <SkeletonBar kind="title" width="1/2" />
        <SkeletonBar kind="title" width="3/5" />
      </div>
    );
  }
  if (lines.length === 0) {
    return <p className="px-4 py-1 text-body text-fg-muted">{statusWords.nothingRefused}</p>;
  }
  return (
    <>
      <ul
        // Safari drops the list semantics of a list without bullets, so the role is set on purpose.
        // biome-ignore lint/a11y/noRedundantRoles: see above
        role="list"
        aria-labelledby={headingId}
        className="m-0 list-none rounded-md border border-border p-0"
      >
        {lines.map((line, index) => (
          // A refusal has no id of its own, and the list only grows at the top, so the line and its place are the key.
          <li
            key={`${index}:${line}`}
            className="min-h-10 min-w-0 border-b border-border px-4 py-3 text-body text-fg [overflow-wrap:anywhere] last:border-b-0"
          >
            {line}
          </li>
        ))}
      </ul>
      {lines.length >= refusalLimit ? (
        <p className="px-4 text-small text-fg-muted">{statusWords.capNote(refusalLimit)}</p>
      ) : null}
    </>
  );
}
