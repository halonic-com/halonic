import { useEffect, useSyncExternalStore } from "react";
import type { Recap, RecapWork } from "../recap.ts";
import type { RecapStore } from "../recap-store.ts";

/** Props for {@link RecapView}. */
export interface RecapViewProps {
  readonly store: RecapStore;
}

/**
 * The daily recap: items answered, items still open with how long they have
 * waited, work done and work newly blocked since the last recap. Questions
 * and titles are agent-written, so they are drawn as plain text only.
 */
export function RecapView({ store }: RecapViewProps) {
  useEffect(() => {
    void store.open();
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.snapshot);

  // The heading stays in every state, so the place reads "Recap" also while nothing changed.
  return (
    <section aria-labelledby="overview-recap" className="flex flex-col gap-2 px-4 py-3">
      <h2 id="overview-recap" className="text-heading">
        Recap
      </h2>
      {/* Empty, the live region stays for screen readers only, so it adds no gap under "Recap". */}
      <p role="status" className={state.kind === "loading" ? "text-fg-muted" : "sr-only"}>
        {state.kind === "loading" ? "Loading…" : ""}
      </p>
      {state.kind === "failed" ? (
        <p role="alert" className="text-danger">
          The recap couldn't be read.
        </p>
      ) : null}
      {state.kind === "ready" ? <RecapSections recap={state.recap} /> : null}
    </section>
  );
}

function RecapSections({ recap }: { readonly recap: Recap }) {
  if (recap.empty) {
    return <p className="text-fg-muted">Nothing changed since your last recap.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p>{countLine(recap.answered, "item answered", "items answered")}</p>
      <p>{countLine(recap.open.length, "item still open", "items still open")}</p>
      <ul className="ps-4">
        {recap.open.map((item) => (
          <li key={item.id}>{`${item.question} · waiting ${waitingWords(item.waitingMs)}`}</li>
        ))}
      </ul>
      <WorkList heading="Done" work={recap.done} />
      <WorkList heading="Newly blocked" work={recap.newlyBlocked} />
    </div>
  );
}

function WorkList({
  heading,
  work,
}: {
  readonly heading: string;
  readonly work: readonly RecapWork[];
}) {
  if (work.length === 0) return null;
  return (
    <div>
      <h3 className="font-medium">{heading}</h3>
      <ul className="ps-4">
        {work.map((item) => (
          <li key={item.id}>{`${item.label} ${item.title}`}</li>
        ))}
      </ul>
    </div>
  );
}

function countLine(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

/** How long an item has waited, in its largest whole unit. */
export function waitingWords(waitingMs: number): string {
  if (waitingMs >= day) return countLine(Math.floor(waitingMs / day), "day", "days");
  if (waitingMs >= hour) return countLine(Math.floor(waitingMs / hour), "hour", "hours");
  return countLine(Math.floor(waitingMs / minute), "minute", "minutes");
}
