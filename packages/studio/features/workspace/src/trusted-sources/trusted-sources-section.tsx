import { Button, Dialog, EmptyState, SkeletonBar, ViewOnlyLine } from "@halonicjs/studio-kit";
import {
  copyDetailsWords,
  detailsOf,
  type EngineWords,
  engineReasonFor,
  engineWordsOf,
  focusSectionHeading,
  isUnexplained,
  type SettingsSectionProps,
  type SettingsSurface,
  sectionHeading,
  sectionHeadingLevel,
  useCopyDetailsInPlace,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SignOutFailedError,
  type TrustedSource,
  type TrustedSourcesHost,
  TrustedSourcesService,
} from "../api.ts";
import * as text from "./trusted-sources-text.ts";

/** Settings › Trusted sources as the settings container shows it. */
export function TrustedSourcesSection({ context, place, surface }: SettingsSectionProps) {
  const host = context.services.get(TrustedSourcesService);
  return (
    <TrustedSourcesView
      host={host}
      readOnly={place === "served"}
      announce={(line) => context.announcer.announce(line)}
      engine={engineWordsOf(context)}
      surface={surface}
    />
  );
}

/** The props of {@link TrustedSourcesView}. */
export interface TrustedSourcesViewProps {
  readonly host: TrustedSourcesHost;
  /** Served from another device: the server's records, which can't be removed from here. */
  readonly readOnly: boolean;
  /** Says a result where a screen reader hears it: the settings container's live region. */
  readonly announce: (line: string) => void;
  /** Whose words say the engine isn't answering; the desktop app's when absent. */
  readonly engine?: EngineWords;
  /** `phone` on the phone's Settings page, where the error's heading sits under the page's `h1`. */
  readonly surface?: SettingsSurface;
}

/** The records, most recently trusted first, as the list shows them. */
export function newestFirst(sources: readonly TrustedSource[]): TrustedSource[] {
  return [...sources].sort((a, b) => Date.parse(b.trustedAt) - Date.parse(a.trustedAt));
}

type Loaded =
  | { readonly state: "loading" }
  | { readonly state: "failed"; readonly reason: string }
  | { readonly state: "ready"; readonly sources: readonly TrustedSource[] };

/**
 * Settings › Trusted sources (`workspace.trusted-sources`): every trust record on this computer,
 * with **Remove** and its confirmation, the empty sentence, the note on the CLI's own records and,
 * served, the same list read-only. A list that can't be read says so and offers Try again.
 */
export function TrustedSourcesView({
  host,
  readOnly,
  announce,
  engine,
  surface,
}: TrustedSourcesViewProps) {
  const { notAnswering } = engine ?? engineWordsOf({});
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [removing, setRemoving] = useState<TrustedSource | undefined>();
  const [busy, setBusy] = useState(false);
  // Try again keeps the error on screen with its button busy, and swaps in the list only once it reads.
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // For an internal error only: what **Copy details** puts on the clipboard (microcopy 22 F13).
  const [details, setDetails] = useState<string | undefined>();
  const copyDetails = useCopyDetailsInPlace();
  const root = useRef<HTMLDivElement | null>(null);
  const alive = useRef(true);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  // Where focus goes when the dialog closes after a Remove: the next row's button, else the previous.
  const focusAfter = useRef<string | undefined>(undefined);

  // After Try again reads, the heading takes the focus its button had.
  const focusHeading = useRef(false);

  const load = useCallback(() => {
    host.list().then(
      (sources) => {
        if (!alive.current) return;
        setLoaded({ state: "ready", sources: newestFirst(sources) });
        setRetrying(false);
      },
      (reason: unknown) => {
        if (!alive.current) return;
        setLoaded({ state: "failed", reason: reasonOf(reason, notAnswering) });
        focusHeading.current = false;
        setRetrying(false);
      },
    );
  }, [host, notAnswering]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (loaded.state !== "ready" || !focusHeading.current) return;
    focusHeading.current = false;
    focusSectionHeading(root.current);
  }, [loaded.state]);

  const tryAgain = () => {
    focusHeading.current = true;
    setRetrying(true);
    load();
  };

  const confirmRemove = async (source: TrustedSource) => {
    setBusy(true);
    setError(undefined);
    setDetails(undefined);
    try {
      await host.remove(source.location);
    } catch (reason) {
      if (!alive.current) return;
      const failure = removalFailure(source, reason, notAnswering);
      setBusy(false);
      setError(failure.line);
      setDetails(failure.details);
      if (failure.signOutPending) markSignOutPending(source.location);
      return;
    }
    if (!alive.current) return;
    if (loaded.state === "ready") {
      const at = loaded.sources.findIndex((one) => one.location === source.location);
      focusAfter.current = (loaded.sources[at + 1] ?? loaded.sources[at - 1])?.location;
    }
    setBusy(false);
    setRemoving(undefined);
    setLoaded((now) =>
      now.state === "ready"
        ? { state: "ready", sources: now.sources.filter((one) => one.location !== source.location) }
        : now,
    );
    announce(text.removedLine(source.name, source.kind ?? "workspace"));
  };

  const markSignOutPending = (location: string) => {
    setLoaded((now) =>
      now.state === "ready"
        ? {
            state: "ready",
            sources: now.sources.map((one) =>
              one.location === location ? { ...one, signOutPending: true } : one,
            ),
          }
        : now,
    );
  };

  if (loaded.state === "failed") {
    return (
      <EmptyState
        tone="error"
        align="start"
        headingLevel={sectionHeadingLevel(surface)}
        title={text.LOAD_FAILED}
        description={loaded.reason}
        action={{ label: text.TRY_AGAIN, onClick: tryAgain, busy: retrying }}
      />
    );
  }
  const renderContent = () => {
    if (loaded.state === "loading") {
      return (
        <div role="status" className="flex flex-col gap-3">
          <span className="sr-only">{text.LOADING}</span>
          <div aria-hidden="true" className="flex flex-col gap-3">
            <SkeletonBar kind="title" width="1/2" />
            <SkeletonBar kind="meta" width="2/3" />
          </div>
        </div>
      );
    }
    if (loaded.sources.length === 0) return <p>{text.EMPTY}</p>;
    return (
      <ul className="m-0 flex list-none flex-col p-0">
        {loaded.sources.map((source) => (
          <SourceRow
            key={source.location}
            source={source}
            readOnly={readOnly}
            buttonRef={(node) => {
              if (node) removeButtons.current.set(source.location, node);
              else removeButtons.current.delete(source.location);
            }}
            onRemove={() => {
              setError(undefined);
              setDetails(undefined);
              setRemoving(source);
            }}
          />
        ))}
      </ul>
    );
  };
  const content = renderContent();
  return (
    <div ref={root} className="flex flex-col gap-4">
      {readOnly ? <ViewOnlyLine>{text.VIEW_ONLY}</ViewOnlyLine> : null}
      {content}
      {readOnly ? null : (
        <p className="text-small text-fg-muted">
          {text.CLI_NOTE[0]}
          <code className="font-mono">{text.CLI_NOTE[1]}</code>
          {text.CLI_NOTE[2]}
        </p>
      )}
      {removing === undefined ? null : (
        <Dialog
          title={text.removeTitle(removing.name)}
          confirm={{ label: text.REMOVE_TRUST, variant: "danger", busyLabel: text.REMOVING }}
          busy={busy}
          {...(error === undefined ? {} : { error })}
          {...(details === undefined
            ? {}
            : {
                errorAction: {
                  label: copyDetailsWords.label,
                  doneLabel: copyDetailsWords.done,
                  onClick: () => copyDetails(details),
                },
              })}
          returnFocus={() => {
            const next = focusAfter.current;
            focusAfter.current = undefined;
            return (next && removeButtons.current.get(next)) || sectionHeading(root.current);
          }}
          onConfirm={() => void confirmRemove(removing)}
          onCancel={() => setRemoving(undefined)}
        >
          <p>{removing.kind === "plugin" ? text.REMOVE_PLUGIN_BODY : text.REMOVE_BODY}</p>
        </Dialog>
      )}
    </div>
  );
}

/** One record's row: its name and kind, its location, its state and, unless served, **Remove**. */
function SourceRow({
  source,
  readOnly,
  buttonRef,
  onRemove,
}: {
  readonly source: TrustedSource;
  readonly readOnly: boolean;
  readonly buttonRef: (node: HTMLButtonElement | null) => void;
  readonly onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className="text-body-strong">{source.name}</span>
          <span className="text-small text-fg-muted">{text.KIND[source.kind ?? "workspace"]}</span>
        </span>
        <span className="break-all font-mono text-small text-fg-muted">{source.location}</span>
      </span>
      <span className="text-small text-fg-muted">{rowState(source)}</span>
      {readOnly ? null : (
        <Button variant="ghost" size="sm" ref={buttonRef} onClick={onRemove}>
          {text.REMOVE}
          {/* Names the row for a screen reader, so each row's Remove differs. */}
          <span className="sr-only">{text.removeSpoken(source.name)}</span>
        </Button>
      )}
    </li>
  );
}

/**
 * What the Remove trust dialog says when a removal failed, with **Copy details** for an internal
 * error, and whether the row now waits for a sign-out: a plugin whose record is gone but whose
 * sign-out failed keeps its row, saying so.
 */
function removalFailure(
  source: TrustedSource,
  error: unknown,
  notAnswering: string,
): { readonly line: string; readonly details?: string; readonly signOutPending: boolean } {
  const signOutPending = error instanceof SignOutFailedError;
  const why = signOutPending ? error.cause : error;
  const reason = reasonOf(why, notAnswering);
  const line = signOutPending
    ? text.signOutFailed(source.name, reason)
    : text.removeFailed(source.name, reason);
  return isUnexplained(why)
    ? { line, details: detailsOf(line, why), signOutPending }
    : { line, signOutPending };
}

/** What a row says at its end: whether its sign-out is still to do, its folder is gone, or when it was trusted. */
function rowState(source: TrustedSource): string {
  if (source.signOutPending === true) return text.NOT_SIGNED_OUT;
  if (source.found === false) return text.FOLDER_NOT_FOUND;
  return text.trustedOn(source.trustedAt);
}

/** Why a read or a removal failed, without its closing full stop; the raw error never shows. */
function reasonOf(error: unknown, notAnswering: string): string {
  return engineReasonFor(error, notAnswering).replace(/\.+$/u, "");
}
