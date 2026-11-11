import type { PluginUi } from "@halonicjs/format";
import {
  AlertIcon,
  Button,
  Card,
  DashedRingIcon,
  RefreshIcon,
  SKELETON_AFTER_MS,
  SkeletonBar,
  WarningIcon,
} from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { fromPlugin, TRY_AGAIN } from "../commands/command-text.ts";
import type { PluginToolCaller } from "../commands/plugin-command-dialog.tsx";
import { PluginResult } from "../ui/plugin-result.tsx";
import {
  cantLoadLine,
  cardFailedLine,
  DETAILS,
  notTrustedLine,
  REVIEW,
  refreshLabel,
} from "./card-text.ts";

/** One card from a plugin's `ui.cards`. */
export type PluginCardUi = PluginUi["cards"][number];

/**
 * Where the card's plugin stands: `on` when it's trusted, `not-trusted` when it's new or changed
 * since it was trusted, `cant-load` when its folder can't be read or checked.
 */
export type PluginCardStatus = "on" | "not-trusted" | "cant-load";

/** The props of `PluginCard`. */
export interface PluginCardProps {
  /** The plugin's id and its name, which is untrusted text. */
  readonly plugin: { readonly id: string; readonly name: string };
  readonly status: PluginCardStatus;
  readonly card: PluginCardUi;
  /** Calls a plugin's tools; wrap it in `timedToolCaller` so a call can't hang the card. */
  readonly caller: PluginToolCaller;
  /** Review, on a card whose plugin isn't trusted: opens the plugin's trust check. */
  readonly onReview: () => void;
  /** Details, on a card whose plugin can't load: opens the plugin's page. */
  readonly onDetails: () => void;
}

type Run =
  | { readonly kind: "loading" }
  | { readonly kind: "done"; readonly text: string; readonly refreshing: boolean }
  | { readonly kind: "failed"; readonly reason: string };

/**
 * A plugin's card on Home (design 8.2, UX checklist 8): the card's title, its tool's answer as
 * plain text, sanitised Markdown or a table, and the footer "From the *name* plugin". While the
 * plugin is on, the card calls its tool when it shows, ↻ calls it again and a failure says why
 * with **Try again**; only a failure is announced. A plugin that isn't trusted or can't load
 * leaves the card in place, empty, with **Review** or **Details**, so Home doesn't jump when it
 * turns on. The title and the footer show at once; only the answer has a skeleton (T16-F35).
 *
 * @example
 * <PluginCard plugin={{ id: "weather", name: "Weather" }} status="on" card={today}
 *   caller={pluginTools} onReview={review} onDetails={openPage} />
 */
export function PluginCard({ plugin, status, card, caller, onReview, onDetails }: PluginCardProps) {
  const [run, setRun] = useState<Run>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  // The call whose answer is current: a newer call, a plugin that's turned off or a card that's
  // gone drops an older answer.
  const latest = useRef(0);

  useEffect(() => {
    if (status !== "on") return;
    const call = ++latest.current;
    setRun((now) => (now.kind === "done" ? { ...now, refreshing: true } : { kind: "loading" }));
    caller.call(plugin.id, card.tool, card.args).then(
      (text) => {
        if (call === latest.current) setRun({ kind: "done", text, refreshing: false });
      },
      (error: unknown) => {
        if (call === latest.current) setRun({ kind: "failed", reason: reasonOf(error) });
      },
    );
    return () => void ++latest.current;
  }, [status, attempt, caller, plugin.id, card]);

  const callAgain = () => setAttempt((count) => count + 1);

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-section wrap-anywhere">{card.title}</h3>
          {status === "on" ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshIcon />}
              label={refreshLabel(card.title)}
              busy={run.kind === "loading" || (run.kind === "done" && run.refreshing)}
              onClick={callAgain}
            />
          ) : null}
        </div>
        <div className="min-h-16" aria-busy={status === "on" && run.kind === "loading"}>
          {status === "on" ? (
            <CardAnswer card={card} run={run} onTryAgain={callAgain} />
          ) : (
            <CardEmpty
              icon={status === "not-trusted" ? <DashedRingIcon /> : <WarningIcon />}
              line={
                status === "not-trusted" ? notTrustedLine(plugin.name) : cantLoadLine(plugin.name)
              }
              action={status === "not-trusted" ? REVIEW : DETAILS}
              onAction={status === "not-trusted" ? onReview : onDetails}
            />
          )}
        </div>
      </div>
      <p className="-mx-4 -mb-4 mt-4 flex items-center gap-2 border-t border-border px-4 py-2 text-caption text-fg-subtle wrap-anywhere">
        <span
          aria-hidden="true"
          className="inline-grid size-4 shrink-0 place-items-center rounded-xs bg-halo-tint text-accent-text uppercase"
        >
          {Array.from(plugin.name)[0] ?? ""}
        </span>
        {fromPlugin(plugin.name)}
      </p>
    </Card>
  );
}

/** The tool's answer, its skeleton while it loads, or why it failed with Try again. */
function CardAnswer({
  card,
  run,
  onTryAgain,
}: {
  readonly card: PluginCardUi;
  readonly run: Run;
  readonly onTryAgain: () => void;
}) {
  return (
    <>
      {run.kind === "loading" ? <AnswerSkeleton /> : null}
      {run.kind === "done" ? <PluginResult text={run.text} show={card.show} /> : null}
      {/* A live region from the start, so only a failure is announced, never an answer. */}
      <div aria-live="polite">
        {run.kind === "failed" ? (
          <CardEmpty
            icon={<AlertIcon />}
            tone="danger"
            line={cardFailedLine(card.title, run.reason)}
            action={TRY_AGAIN}
            onAction={onTryAgain}
          />
        ) : null}
      </div>
    </>
  );
}

/** A line with its mark, then one `secondary` sm button: an error, or why the card is empty. */
function CardEmpty({
  icon,
  tone = "muted",
  line,
  action,
  onAction,
}: {
  readonly icon: ReactNode;
  readonly tone?: "muted" | "danger";
  readonly line: string;
  readonly action: string;
  readonly onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="flex gap-2 text-small text-fg-muted wrap-anywhere">
        <span
          className={`mt-0.5 inline-grid size-icon-sm shrink-0 *:size-full ${tone === "danger" ? "text-danger" : ""}`}
        >
          {icon}
        </span>
        {line}
      </p>
      <Button variant="secondary" size="sm" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}

/** One small block and one long bar, after the kit's 300 ms (T16-F35); hidden from screen readers. */
function AnswerSkeleton() {
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowing(true), SKELETON_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!showing) return null;
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      <SkeletonBar kind="icon" />
      <SkeletonBar kind="meta" width="full" />
    </div>
  );
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
