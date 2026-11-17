import { Button, Callout, EmptyState, SkeletonBar, usePresentation } from "@halonicjs/studio-kit";
import { ItemGone, type ItemViewProps } from "@halonicjs/studio-shell";
import { useCallback, useRef } from "react";
import { type RoutinesHost, RoutinesHostService, type RoutineView } from "../api.ts";
import { Avatar } from "../list/routine-rows.tsx";
import { pageWords } from "./page-words.ts";
import { useRoutine } from "./use-routine.ts";

/** The routine's page in its tab: `item` names the routine, the host gives its fields. */
export function RoutinePage({ item, context }: ItemViewProps) {
  const { openPlace } = context;
  return (
    <RoutineScreen
      host={context.services.get(RoutinesHostService)}
      hubId={item.hub}
      id={item.id}
      {...(openPlace && { goToRoutines: () => openPlace("routines") })}
    />
  );
}

/** Props for {@link RoutineScreen}. */
export interface RoutineScreenProps {
  readonly host: RoutinesHost;
  readonly hubId: string;
  readonly id: string;
  /** Opens the Routines list, for a routine that isn't there any more; without it the page can't offer that. */
  readonly goToRoutines?: () => void;
}

/**
 * The routine page's frame (`routines.page.frame-and-states`): the header with the letter avatar,
 * "ROUTINE" and the name, the summary line, the quiet "Changes not live yet" line and the
 * "isn't live yet" notice. While the file is read a skeleton shows after 300 ms; a routine that
 * can't be read says why, and one that is gone says so with a way back to Routines.
 */
export function RoutineScreen({ host, hubId, id, goToRoutines }: RoutineScreenProps) {
  // After a Try again reads, the routine's name takes the focus the button had.
  const title = useRef<HTMLHeadingElement>(null);
  const focusTitle = useCallback(() => title.current?.focus(), []);
  const { load, retry } = useRoutine(host, { hubId, id }, focusTitle);
  const phone = usePresentation() === "phone";
  if (load.kind === "failed" && load.gone && goToRoutines !== undefined) {
    return <ItemGone kindName="routine" place="Routines" onGoTo={goToRoutines} />;
  }
  const name = load.kind === "ready" ? load.routine.name : id;
  return (
    <div className="flex size-full min-h-0 flex-col">
      <header
        className={
          phone
            ? "flex flex-col gap-3 border-b border-border px-4 py-3"
            : "flex items-center gap-3 border-b border-border px-6 py-3"
        }
      >
        {/* On a phone the top bar already names the routine, so the page keeps only its type. */}
        <div className="flex items-center gap-3">
          <Avatar name={name} />
          <div className="flex flex-col">
            <p className="text-caption text-fg-muted">{pageWords.kind}</p>
            <h1 ref={title} tabIndex={-1} className={phone ? "sr-only" : "text-title outline-none"}>
              {name}
            </h1>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 py-4">
        {load.kind === "ready" && <Summary routine={load.routine} />}
        {load.kind === "failed" && (
          <EmptyState
            tone="error"
            title={pageWords.loadFailedTitle}
            description={load.reason}
            action={{ label: pageWords.tryAgain, onClick: retry, busy: load.retrying }}
          />
        )}
        {load.kind === "loading" && load.skeleton && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{pageWords.loading(name)}</span>
            <SkeletonBar kind="value" />
            {load.slow && (
              <p className="flex items-center gap-3 text-small text-fg-muted">
                {pageWords.stillLoading}
                <Button variant="secondary" size="sm" onClick={retry}>
                  {pageWords.tryAgain}
                </Button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * What sits under the header once the routine is read: its one-line summary (muted, with "Off · "
 * in front, when it is off), then at most one note about what is live. A routine that is on but
 * has never been live has the notice and nothing else, since "Changes not live yet" would be a
 * second reason for the same thing.
 */
function Summary({ routine }: { readonly routine: RoutineView }) {
  const neverLive = routine.enabled && !routine.everLive;
  return (
    <>
      <p className={routine.enabled ? "text-body" : "text-body text-fg-muted"}>
        {routine.enabled ? routine.summary : `${pageWords.off} · ${routine.summary}`}
      </p>
      {neverLive && <Callout tone="info">{pageWords.neverLive}</Callout>}
      {!neverLive && routine.changesNotLive && (
        <p className="text-small text-fg-muted">{pageWords.changesNotLive}</p>
      )}
    </>
  );
}
