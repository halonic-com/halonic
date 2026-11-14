import { Button, Dialog, EmptyState, SkeletonBar, ViewOnlyLine } from "@halonicjs/studio-kit";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import { type TrustedSource, type TrustedSourcesHost, TrustedSourcesService } from "../api.ts";
import * as text from "./trusted-sources-text.ts";

/** Settings › Trusted sources as the settings container shows it. */
export function TrustedSourcesSection({ context, place }: SettingsSectionProps) {
  const host = context.services.get(TrustedSourcesService);
  return (
    <TrustedSourcesView
      host={host}
      readOnly={place === "served"}
      announce={(line) => context.announcer.announce(line)}
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
export function TrustedSourcesView({ host, readOnly, announce }: TrustedSourcesViewProps) {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [removing, setRemoving] = useState<TrustedSource | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const lead = useRef<HTMLParagraphElement | null>(null);
  const alive = useRef(true);

  const load = useCallback(() => {
    setLoaded({ state: "loading" });
    host.list().then(
      (sources) => alive.current && setLoaded({ state: "ready", sources: newestFirst(sources) }),
      (reason: unknown) =>
        alive.current && setLoaded({ state: "failed", reason: reasonOf(reason) }),
    );
  }, [host]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const confirmRemove = async (source: TrustedSource) => {
    setBusy(true);
    setError(undefined);
    try {
      await host.remove(source.location);
    } catch (reason) {
      if (!alive.current) return;
      setBusy(false);
      setError(text.removeFailed(source.name, reasonOf(reason)));
      return;
    }
    if (!alive.current) return;
    setBusy(false);
    setRemoving(undefined);
    setLoaded((now) =>
      now.state === "ready"
        ? { state: "ready", sources: now.sources.filter((one) => one.location !== source.location) }
        : now,
    );
    announce(text.removedLine(source.name));
  };

  if (loaded.state === "failed") {
    return (
      <EmptyState
        tone="error"
        align="start"
        headingLevel={4}
        title={text.LOAD_FAILED}
        description={loaded.reason}
        action={{ label: text.TRY_AGAIN, onClick: load }}
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
          <li
            key={source.location}
            className="flex items-center gap-3 border-b border-line py-2 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="text-body-strong">{source.name}</span>{" "}
              <span className="break-all text-small text-fg-muted">{source.location}</span>
            </span>
            <span className="text-small text-fg-muted">
              {source.found === false ? text.FOLDER_NOT_FOUND : text.trustedOn(source.trustedAt)}
            </span>
            {readOnly ? null : (
              <Button
                variant="ghost"
                size="sm"
                aria-label={text.removeTitle(source.name).replace(/\?$/u, "")}
                onClick={() => {
                  setError(undefined);
                  setRemoving(source);
                }}
              >
                {text.REMOVE}
              </Button>
            )}
          </li>
        ))}
      </ul>
    );
  };
  const content = renderContent();
  return (
    <div className="mt-1 flex flex-col gap-4">
      {readOnly ? <ViewOnlyLine>{text.VIEW_ONLY}</ViewOnlyLine> : null}
      <p ref={lead} tabIndex={-1} className="text-small text-fg-muted">
        {readOnly ? text.LEAD_SERVED : text.LEAD}
      </p>
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
          returnFocus={() => lead.current}
          onConfirm={() => void confirmRemove(removing)}
          onCancel={() => setRemoving(undefined)}
        >
          <p>{text.REMOVE_BODY}</p>
        </Dialog>
      )}
    </div>
  );
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\.+$/u, "");
}
