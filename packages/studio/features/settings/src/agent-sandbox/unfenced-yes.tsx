import { runnerUnfencedWords } from "@halonicjs/app";
import { Button, useToastStore } from "@halonicjs/studio-kit";
import { type SettingsSurface, sectionHeadingLevel } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UnfencedYesHost } from "../api.ts";
import * as text from "./sandbox-text.ts";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9 Nov", or "9 Nov 2025" in another year; `undefined` for a time that can't be read. */
export function allowedDay(iso: string, now: Date): string | undefined {
  const day = new Date(iso);
  if (Number.isNaN(day.getTime())) return undefined;
  const date = `${day.getDate()} ${months[day.getMonth()]}`;
  return day.getFullYear() === now.getFullYear() ? date : `${date} ${day.getFullYear()}`;
}

/** What the block shows: nothing yet, plugin code in the sandbox, a yes needed, or the saved yes. */
type YesState =
  | { readonly state: "unknown" }
  | { readonly state: "fenced" }
  | { readonly state: "needs-yes"; readonly reason: string | undefined }
  | { readonly state: "allowed"; readonly reason: string; readonly day: string | undefined };

/** The props of {@link UnfencedYesBlock}. */
export interface UnfencedYesBlockProps {
  readonly host: UnfencedYesHost;
  readonly surface?: SettingsSurface | undefined;
  /** Says the result where there are no toasts: the settings container's live region. */
  readonly announce: (line: string) => void;
}

/** The host's word on the yes, as the block shows it. */
function yesStateOf(status: Awaited<ReturnType<UnfencedYesHost["status"]>>, now: Date): YesState {
  if (status.run === "fenced") return { state: "fenced" };
  if (status.run !== "allowed") return { state: "needs-yes", reason: status.reason };
  // A day that can't be read still leaves a saved yes to take back; only the day is left out.
  return { state: "allowed", reason: status.reason, day: allowedDay(status.allowedAt, now) };
}

/** Reads the host's yes when the block shows, and again on `read`; a late answer is dropped. */
function useUnfencedYes(host: UnfencedYesHost) {
  const [yes, setYes] = useState<YesState>({ state: "unknown" });
  const reads = useRef(0);
  const read = useCallback(async () => {
    reads.current += 1;
    const current = reads.current;
    const next = await host.status().then(
      (status) => yesStateOf(status, new Date()),
      // A host that can't say shows nothing: nothing here may claim a yes it didn't read.
      (): YesState => ({ state: "unknown" }),
    );
    if (reads.current === current) setYes(next);
  }, [host]);
  useEffect(() => {
    void read();
    return () => {
      reads.current += 1;
    };
  }, [read]);
  return { yes, read };
}

/**
 * Settings › Agent sandbox's "Plugins and integrations" (`settings.unfenced-yes-take-back`, R16):
 * while plugin code doesn't run in the sandbox on this computer, the heading and why it needs a
 * yes; while a yes is saved, the reason, the day and **Take back**. Taking it back goes through
 * the host, which stops every plugin running without the sandbox before it answers, so the toast
 * is true when it shows. The host still decides at every start; this block only shows and asks.
 */
export function UnfencedYesBlock({ host, surface, announce }: UnfencedYesBlockProps) {
  const toasts = useToastStore();
  const { yes, read } = useUnfencedYes(host);
  const [takingBack, setTakingBack] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const say = (title: string, line: string, tone: "success" | "danger") => {
    if (toasts) toasts.show({ tone, title, text: line });
    else announce(title.endsWith(".") ? `${title} ${line}` : `${title}: ${line}`);
  };

  const takeBack = () => {
    setTakingBack(true);
    host.takeBack().then(
      async () => {
        say(text.TAKEN_BACK_TITLE, text.TAKEN_BACK_TEXT, "success");
        await read();
        setTakingBack(false);
        // The button is gone with the yes; the block's name keeps the focus in the section.
        heading.current?.focus();
      },
      (error: unknown) => {
        say(
          text.TAKE_BACK_FAILED_TITLE,
          error instanceof Error ? error.message : String(error),
          "danger",
        );
        setTakingBack(false);
      },
    );
  };

  if (yes.state === "unknown" || yes.state === "fenced") return null;
  const Heading = `h${sectionHeadingLevel(surface)}` as const;
  return (
    <div className="flex max-w-120 flex-col gap-2">
      <Heading ref={heading} tabIndex={-1} className="text-body font-medium outline-none">
        {text.UNFENCED_TITLE}
      </Heading>
      <p className="text-small text-fg-muted">
        {yes.reason === "windows" ? text.UNFENCED_LINE : text.UNFENCED_LINE_HERE}
      </p>
      {yes.state === "allowed" ? (
        <AllowedRow reason={yes.reason} day={yes.day} busy={takingBack} onTakeBack={takeBack} />
      ) : null}
    </div>
  );
}

/** The saved yes: its reason and day, **Take back** and what taking it back does. */
function AllowedRow(props: {
  readonly reason: string;
  readonly day: string | undefined;
  readonly busy: boolean;
  readonly onTakeBack: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-small">
        <span className="block font-medium">{text.UNFENCED_ALLOWED}</span>
        <span className="block text-fg-muted">
          {runnerUnfencedWords(props.reason, "plugin").reason}
          {props.day === undefined ? null : ` ${text.unfencedAllowedOn(props.day)}`}
        </span>
      </p>
      <Button
        variant="secondary"
        size="sm"
        busy={props.busy}
        busyLabel={text.BUSY_TAKE_BACK}
        onClick={props.onTakeBack}
      >
        {text.TAKE_BACK}
      </Button>
      <p className="text-small text-fg-muted">{text.TAKE_BACK_HINT}</p>
    </div>
  );
}
