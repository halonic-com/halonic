import { EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import { engineWords, errorMessageFor, loadView, type ViewRef } from "@halonicjs/studio-shell";
import { type ComponentType, type KeyboardEvent, useEffect, useState } from "react";
import type { InboxSetupSource, SetupViewProps } from "../inbox.ts";
import { SetupCard } from "./setup-card.tsx";

/** Props for {@link SetupPane}. */
export interface SetupPaneProps extends SetupViewProps {
  /** The item's source, or none once it was taken out. */
  readonly source: InboxSetupSource | undefined;
}

/**
 * An open setup item in the Inbox's pane: the source's own view at the current step, loaded when
 * it opens, else the item's title and progress line. Escape closes it, as **Not now** does.
 * While the engine isn't answering, the host's "showing what it said last" line sits over the item (UX checklist 1, U3).
 * While the view loads, a skeleton says "Loading the Google setup"; when it can't load, "Couldn't
 * load the Google setup", the reason and **Try again** (UX checklist 1, U2).
 */
export function SetupPane({
  source,
  item,
  answering,
  words = engineWords["desktop-app"],
  close,
}: SetupPaneProps) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    close();
  };
  const props: SetupViewProps = { item, answering, words, close };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape from anywhere in the item closes it
    <div className="flex flex-col" onKeyDown={onKeyDown}>
      {answering ? null : <p className="px-4 pt-4 text-small text-fg-muted">{words.showingLast}</p>}
      {source?.view === undefined ? (
        <SetupCard {...props} />
      ) : (
        <LoadedView view={source.view} name={source.name} props={props} />
      )}
    </div>
  );
}

type Loaded =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly error: unknown }
  | { readonly status: "ready"; readonly View: ComponentType<SetupViewProps> };

function LoadedView({
  view,
  name,
  props,
}: {
  readonly view: ViewRef;
  readonly name: string;
  readonly props: SetupViewProps;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // `attempt` is in the list so Try again loads the view again.
  useEffect(() => {
    let current = true;
    setLoaded({ status: "loading" });
    loadView<ComponentType<SetupViewProps>>(view).then(
      (View) => current && setLoaded({ status: "ready", View }),
      (error: unknown) => current && setLoaded({ status: "failed", error }),
    );
    return () => {
      current = false;
    };
  }, [view, attempt]);

  if (loaded.status === "ready") return <loaded.View {...props} />;
  if (loaded.status === "failed") {
    const title = `Couldn't load the ${name} setup`;
    return (
      <div className="p-4">
        <EmptyState
          tone="error"
          align="start"
          title={title}
          description={errorMessageFor(loaded.error, { title }).body}
          action={{ label: "Try again", onClick: () => setAttempt((count) => count + 1) }}
        />
      </div>
    );
  }
  return (
    <div role="status" aria-label={`Loading the ${name} setup`} className="flex flex-col gap-3 p-4">
      <SkeletonBar kind="title" width="2/3" />
      <SkeletonBar kind="meta" width="2/5" />
      <SkeletonBar kind="meta" width="full" />
      <SkeletonBar kind="meta" width="7/10" />
    </div>
  );
}
