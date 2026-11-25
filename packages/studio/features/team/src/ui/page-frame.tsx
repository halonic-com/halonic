import { Button, Card, SkeletonBar } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { teamWords } from "../team-words.ts";
import { type ArrivalFocus, useArrivalFocus, useKeepFocus } from "./keep-focus.ts";

/**
 * The page's frame in every state: its padding, the title in the page-title style, the freshness
 * slot ("As of 13:00 · 2 min ago", or "Loading…") and the header's action on the right (s01, s09:
 * "Open AI seats in Paperclip ↗"). On a phone they wrap under the title. The screen keeps one frame mounted across loading, failed and read, so
 * the main and h1 stay the same elements, and focus lands on the h1 when what had it goes away.
 * `arrival` says where focus goes when the page replaces another one.
 */
export function PageFrame(props: {
  freshness?: ReactNode;
  action?: ReactNode;
  busy?: boolean;
  arrival?: ArrivalFocus | undefined;
  children: ReactNode;
}) {
  const { heading, remember } = useKeepFocus();
  const page = useArrivalFocus(heading, props.arrival, props.busy === true);
  return (
    <main
      ref={page}
      aria-busy={props.busy === true ? "true" : undefined}
      aria-label={props.busy === true ? teamWords.loadingSpoken : undefined}
      className="flex w-full flex-col gap-4 px-6 py-5 phone:px-4"
      onFocus={remember}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 ref={heading} tabIndex={-1} className="text-title">
          {teamWords.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {props.freshness === undefined ? null : (
            <p className="text-small text-fg-muted">{props.freshness}</p>
          )}
          {props.action}
        </div>
      </header>
      {props.children}
    </main>
  );
}

/** The bordered Try again button of the failed and offline states. */
export function TryAgain({ onPress }: { onPress: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onPress}>
      {teamWords.tryAgain}
    </Button>
  );
}

/** One tile's skeleton: its caption, its headline value, and a line under it. */
function TileSkeleton() {
  return (
    <div className="min-w-0 flex-1">
      <Card>
        <span className="flex flex-col gap-3">
          <SkeletonBar kind="meta" width="1/3" />
          <SkeletonBar kind="value" />
          <SkeletonBar kind="meta" width="2/3" />
        </span>
      </Card>
    </div>
  );
}

/** One seat row's skeleton: its name and its state. */
function RowSkeleton() {
  return (
    <Card>
      <span className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <SkeletonBar kind="title" width="2/5" />
        </span>
        <SkeletonBar kind="trailing" />
      </span>
    </Card>
  );
}

/** Loading (HAL-17515 s08): skeleton tiles and rows where the numbers go, inside the page's frame. */
export function LoadingBody() {
  return (
    <>
      <div className="flex gap-3 phone:flex-col">
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton />
      </div>
      <div className="flex flex-col gap-2">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    </>
  );
}
