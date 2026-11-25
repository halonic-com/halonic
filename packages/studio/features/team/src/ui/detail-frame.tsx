import type { MessagingId } from "@halonicjs/ports";
import { BackIcon, Card, ChevronRightIcon } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useState } from "react";
import { teamDetailWords as words } from "../team-detail-words.ts";
import type { TeamDetails } from "../team-details.ts";
import { teamWords } from "../team-words.ts";
import { LoadingBody, PageFrame, TryAgain } from "./page-frame.tsx";

/** A page the Team place can show over Spend and seats. */
export type TeamPage =
  | { kind: "agent"; id: MessagingId }
  | { kind: "seat"; id: MessagingId }
  | { kind: "agents" };

/** The `data-opens` key of the row that opens `page`, so Back can focus that row again. */
export function pageKey(page: TeamPage): string {
  return page.kind === "agents" ? "agents" : `${page.kind}:${page.id}`;
}

/** What a detail page holds while it reads: still loading, the answer, or a failed read. */
export type Read<Value> = { kind: "loading" } | { kind: "read"; value: Value } | { kind: "failed" };

/** Reads once, again whenever a source says it changed, and on Try again. */
export function useDetail<Value>(details: TeamDetails, read: () => Promise<Value>, key: string) {
  const [shown, setShown] = useState<Read<Value>>({ kind: "loading" });
  const [changed, setChanged] = useState(0);
  const readAgain = () => setChanged((count) => count + 1);
  useEffect(() => details.watch(readAgain), [details]);
  // `read` is a new function each render; `key` says what it reads, so the effect reruns on that.
  useEffect(() => {
    let current = true;
    read().then(
      (value) => current && setShown({ kind: "read", value }),
      (error: unknown) => {
        console.error("A Team detail page couldn't be read:", error);
        if (current) setShown({ kind: "failed" });
      },
    );
    return () => {
      current = false;
    };
  }, [details, key, changed]);
  return { shown, readAgain };
}

/** Opening a detail page focuses its h1, since the page replaces the one whose row was pressed. */
const opened = { kind: "heading" } as const;

/**
 * The small link above a detail page's title that goes back to Spend and seats (HAL-17515 Shared
 * "Back"): "‹ Spend and seats", or "‹ Back" on a phone, where the long label wrapped. It looks like
 * the shell's page back link; the shell's slot only fills for item tabs, and these pages live
 * inside the Spend and seats place, so Back is a button that closes the page in place.
 */
function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <nav aria-label={words.backShort}>
      <button
        type="button"
        aria-label={words.backSpoken}
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-xs text-small text-fg-muted underline-offset-2 hover:text-fg hover:underline focus-ring"
      >
        <span aria-hidden="true" className="inline-grid size-icon-sm shrink-0 *:size-full">
          <BackIcon />
        </span>
        <span className="phone:hidden">{words.back}</span>
        <span className="hidden phone:inline">{words.backShort}</span>
      </button>
    </nav>
  );
}

/**
 * The frame of a detail page: Back, the page's title, then the page, or why there is none. One
 * frame for every state, so the main and h1 stay the same elements when the read lands; until
 * then the h1 says Spend and seats.
 */
export function DetailFrame<Value>(props: {
  shown: Read<Value | undefined>;
  title: (value: Value) => string;
  onBack: () => void;
  onTryAgain: () => void;
  children: (value: Value) => ReactNode;
}) {
  const { shown } = props;
  const loading = shown.kind === "loading";
  const value = shown.kind === "read" ? shown.value : undefined;
  return (
    <PageFrame
      busy={loading}
      freshness={loading ? teamWords.loading : undefined}
      arrival={opened}
      back={<BackLink onBack={props.onBack} />}
      {...(value === undefined ? {} : { title: props.title(value) })}
    >
      {loading ? <LoadingBody /> : null}
      {shown.kind === "failed" ? <TryAgain onPress={props.onTryAgain} /> : null}
      {shown.kind === "read" && value === undefined ? <p>{words.notFound}</p> : null}
      {value === undefined ? null : props.children(value)}
    </PageFrame>
  );
}

/** The › at the end of a row that opens a page. */
export function Chevron() {
  return (
    <span aria-hidden="true" className="inline-grid size-icon-sm text-fg-muted *:size-full">
      <ChevronRightIcon />
    </span>
  );
}

/** A row that opens a page, with › at its end. */
export function OpenRow(props: { onOpen: () => void; children: ReactNode }) {
  return (
    <Card onClick={props.onOpen}>
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 wrap-anywhere">{props.children}</span>
        <Chevron />
      </span>
    </Card>
  );
}
