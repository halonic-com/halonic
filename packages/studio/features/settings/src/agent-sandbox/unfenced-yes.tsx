import { runnerUnfencedWords } from "@halonicjs/app";
import { Button, useToastStore } from "@halonicjs/studio-kit";
import { errorReasonFor, type SettingsSurface, sectionHeadingLevel } from "@halonicjs/studio-shell";
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

/**
 * What the block shows: nothing yet, a status it couldn't read, plugin code in the sandbox, a yes
 * needed, or the saved yes.
 */
type YesState =
  | { readonly state: "unknown" }
  | { readonly state: "unread" }
  | { readonly state: "fenced" }
  | { readonly state: "needs-yes"; readonly reason: string | undefined }
  | { readonly state: "allowed"; readonly reason: string; readonly day: string | undefined };

/** The props of {@link UnfencedYesBlock}. */
export interface UnfencedYesBlockProps {
  readonly host: UnfencedYesHost;
  readonly surface?: SettingsSurface | undefined;
  /** Says the result in the dialog, or where there are no toasts: the settings container's live region. */
  readonly announce: (line: string) => void;
}

/** What **Take back** last said in place, in the Settings dialog. */
type TakeBackResult = { readonly tone: Tone; readonly line: string };
type Tone = "success" | "warning" | "danger";

/** A host refusal's `kind` (the agent host client's `AgentHostError`), if it has one. */
function hostKindOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("kind" in error)) return undefined;
  return typeof error.kind === "string" ? error.kind : undefined;
}

/** Why the host refused a Take back: its kind in plain words where there are some, else the shell's reason. */
function takeBackReasonOf(error: unknown): string {
  const kind = hostKindOf(error);
  if (kind !== undefined && Object.hasOwn(text.TAKE_BACK_HOST_REASONS, kind)) {
    return text.TAKE_BACK_HOST_REASONS[kind] ?? errorReasonFor(error);
  }
  return errorReasonFor(error);
}

/** The host's word on the yes, as the block shows it. */
function yesStateOf(status: Awaited<ReturnType<UnfencedYesHost["status"]>>, now: Date): YesState {
  if (status.run === "fenced") return { state: "fenced" };
  if (status.run !== "allowed") return { state: "needs-yes", reason: status.reason };
  // A day that can't be read still leaves a saved yes to take back; only the day is left out.
  return { state: "allowed", reason: status.reason, day: allowedDay(status.allowedAt, now) };
}

/**
 * Reads the host's yes when the block shows, and again on `read`, which answers what it read; a
 * late answer is dropped.
 */
function useUnfencedYes(host: UnfencedYesHost) {
  const [yes, setYes] = useState<YesState>({ state: "unknown" });
  const reads = useRef(0);
  const read = useCallback(async (): Promise<YesState> => {
    reads.current += 1;
    const current = reads.current;
    const next = await host.status().then(
      (status) => yesStateOf(status, new Date()),
      // A host that can't say gets Try again, never a yes or a no it didn't read.
      (): YesState => ({ state: "unread" }),
    );
    if (reads.current === current) setYes(next);
    return next;
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
 * yes; while a yes is saved, the reason, the day and **Take back**; while the host can't say,
 * the heading, that it couldn't check and **Try again**. Taking it back goes through the host,
 * which stops every plugin running without the sandbox before it answers, so the result is true
 * when it shows. The phone's page says it as a toast; the Settings dialog says it in place and
 * through its live region, since a toast would wait behind the modal dialog (C551). The host
 * still decides at every start; this block only shows and asks.
 */
export function UnfencedYesBlock({ host, surface, announce }: UnfencedYesBlockProps) {
  const toasts = useToastStore();
  const { yes, read } = useUnfencedYes(host);
  const [takingBack, setTakingBack] = useState(false);
  const [result, setResult] = useState<TakeBackResult | undefined>(undefined);
  // A ref, not `takingBack`: the failure toast's Try again keeps the render it was made in.
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const say = (
    title: string,
    line: string,
    tone: Tone,
    action?: { readonly label: string; readonly onClick: () => void },
  ) => {
    const said = title.endsWith(".") ? `${title} ${line}` : `${title}: ${line}`;
    if (toasts && surface === "phone") {
      toasts.show({ tone, title, text: line, ...(action ? { action } : {}) });
      return;
    }
    if (surface !== "phone") setResult({ tone, line: said });
    announce(said);
  };

  const takeBack = () => {
    // One Take back at a time: Try again on an older toast waits for the one still running.
    if (inFlight.current) return;
    inFlight.current = true;
    setResult(undefined);
    setTakingBack(true);
    host.takeBack().then(
      async () => {
        say(text.TAKEN_BACK_TITLE, text.TAKEN_BACK_TEXT, "success");
        await read();
        inFlight.current = false;
        setTakingBack(false);
        // The button is gone with the yes; the block's name keeps the focus in the section.
        heading.current?.focus();
      },
      async (error: unknown) => {
        if (hostKindOf(error) === "take_back_incomplete") {
          // The yes is gone even though some runners didn't stop: say both, and show it gone.
          say(text.TAKEN_BACK_PARTLY_TITLE, text.TAKEN_BACK_TEXT, "warning");
          await read();
          inFlight.current = false;
          setTakingBack(false);
          heading.current?.focus();
          return;
        }
        // Read again before saying the yes is still saved: a refusal alone doesn't prove it.
        const after = await read();
        const reason = takeBackReasonOf(error);
        const line = after.state === "allowed" ? `${reason} ${text.YES_STILL_SAVED}` : reason;
        say(text.TAKE_BACK_FAILED_TITLE, line, "danger", {
          label: text.TRY_AGAIN,
          onClick: takeBack,
        });
        inFlight.current = false;
        setTakingBack(false);
      },
    );
  };

  if (yes.state === "unknown" || yes.state === "fenced") return null;
  const Heading = `h${sectionHeadingLevel(surface)}` as const;
  // A refusal reads under **Take back** while the yes still shows; anything else under the heading.
  const refusedInPlace = result?.tone === "danger" && yes.state === "allowed";
  return (
    <div className="flex max-w-120 flex-col gap-2">
      {/* No outline-none: the base heading ring marks the focus, high contrast included. */}
      <Heading ref={heading} tabIndex={-1} className="text-body font-medium">
        {text.UNFENCED_TITLE}
      </Heading>
      {result !== undefined && !refusedInPlace ? (
        <p className={`text-small ${toneClass[result.tone]}`}>{result.line}</p>
      ) : null}
      {yes.state === "unread" ? (
        <NotReadRow onTryAgain={() => void read()} />
      ) : (
        <p className="text-small text-fg-muted">
          {yes.reason === "windows" ? text.UNFENCED_LINE : text.UNFENCED_LINE_HERE}
        </p>
      )}
      {yes.state === "allowed" ? (
        <AllowedRow
          reason={yes.reason}
          day={yes.day}
          busy={takingBack}
          refused={refusedInPlace ? result?.line : undefined}
          onTakeBack={takeBack}
        />
      ) : null}
    </div>
  );
}

/** The colour of the line **Take back** leaves under the heading. */
const toneClass = {
  success: "text-fg-muted",
  warning: "text-warning",
  danger: "text-danger",
} as const;

/** The status the host couldn't give: says so and offers **Try again**, never a yes or a no. */
function NotReadRow(props: { readonly onTryAgain: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-small text-fg-muted">{text.UNFENCED_NOT_READ}</p>
      <Button variant="ghost" size="sm" onClick={props.onTryAgain}>
        {text.TRY_AGAIN}
      </Button>
    </div>
  );
}

/**
 * The saved yes: its reason and day, **Take back**, in the dialog why the host refused it, and what
 * taking it back does. For `windows` only the day: the block's own line already says why (C553,
 * HAL-15227).
 */
function AllowedRow(props: {
  readonly reason: string;
  readonly day: string | undefined;
  readonly busy: boolean;
  readonly refused: string | undefined;
  readonly onTakeBack: () => void;
}) {
  const because =
    props.reason === "windows" ? "" : runnerUnfencedWords(props.reason, "plugin").reason;
  const allowedOn = props.day === undefined ? "" : text.unfencedAllowedOn(props.day);
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-small">
        <span className="block font-medium">{text.UNFENCED_ALLOWED}</span>
        {because || allowedOn ? (
          <span className="block text-fg-muted">
            {[because, allowedOn].filter((part) => part !== "").join(" ")}
          </span>
        ) : null}
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
      {props.refused === undefined ? null : (
        <p className="text-small text-danger">{props.refused}</p>
      )}
      <p className="text-small text-fg-muted">{text.TAKE_BACK_HINT}</p>
    </div>
  );
}
