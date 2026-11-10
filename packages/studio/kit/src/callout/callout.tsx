import { type ReactNode, type Ref, useId, useImperativeHandle, useRef, useState } from "react";
import { Button, OnTintContext } from "../button/button.tsx";
import { AlertIcon } from "../icons/alert-icon.tsx";
import { InfoIcon } from "../icons/info-icon.tsx";
import { WarningIcon } from "../icons/warning-icon.tsx";

/**
 * `info` for a fact and maybe a next step (also the "neutral" notices). `warning` when part of
 * something worked, or Halonic kept a copy: nothing was lost. `danger` only when something failed
 * and wasn't kept. There's no success tone: a success is a toast.
 */
export type CalloutTone = "info" | "warning" | "danger";

/** The Callout's one action, drawn as a ghost button: "Try again". */
export interface CalloutAction {
  readonly label: string;
  /** When it returns a promise, the button is busy until the promise settles. */
  readonly onClick: () => void | Promise<void>;
}

/** What a Callout with `announce="focus"` gives its screen. */
export interface CalloutHandle {
  /**
   * Moves focus to the Callout without scrolling. The screen scrolls its page to the top first,
   * because only the screen knows where its scroll area is (component specs 17.3).
   */
  focus(): void;
}

interface CalloutBase {
  readonly tone: CalloutTone;
  /** "Couldn't change 3 files". Optional. */
  readonly title?: string;
  /** The text, in `text-small` `fg`. Links in it use the normal inline link. */
  readonly children: ReactNode;
  /** File names or paths, listed under the text in mono: three, then "and N more". */
  readonly files?: readonly string[];
  /** A 16px icon from the kit's set in place of the tone's own, such as the trust notice's shield. */
  readonly icon?: ReactNode;
  readonly action?: CalloutAction;
}

/** A Callout that's always there: plain page content, read in page order. */
interface QuietCallout extends CalloutBase {
  readonly announce?: undefined;
  readonly ref?: never;
}

/**
 * A Callout that appears because of something you did, maybe out of sight: a named group that
 * takes focus. Never `role="alert"`: a failure that must leave focus alone goes through the alert
 * slot of the Dialog or the text sheet instead.
 */
interface FocusedCallout extends CalloutBase {
  readonly announce: "focus";
  readonly ref?: Ref<CalloutHandle>;
}

/** The props of `Callout`. */
export type CalloutProps = QuietCallout | FocusedCallout;

/** The number of files shown before "and N more". */
export const CALLOUT_FILES_SHOWN = 3;

/** The fill carries the tone. The transparent edge keeps the box in high contrast (23.5). */
const toneClasses: Record<CalloutTone, { readonly fill: string; readonly icon: string }> = {
  info: { fill: "bg-accent-soft", icon: "text-accent" },
  warning: { fill: "bg-warning-soft", icon: "text-warning" },
  danger: { fill: "bg-danger-soft", icon: "text-danger" },
};

const toneIcons: Record<CalloutTone, ReactNode> = {
  info: <InfoIcon />,
  warning: <WarningIcon />,
  danger: <AlertIcon />,
};

/**
 * The action's label lines up with the text above it: the margin is minus the button's padding,
 * 10px for `sm`, 16px where `sm` draws as `lg` (a phone, a touch screen).
 */
const actionRow = "mt-2 -ml-2.5 phone:-ml-4 touch:-ml-4";

/**
 * A message that belongs to one place on a page and stays there until what it's about is dealt
 * with. It has no close button and never cuts its text. As wide as its column.
 *
 * @example
 * <Callout tone="info" icon={<ShieldIcon />}>This workspace isn't trusted yet.</Callout>
 * <Callout tone="warning" title="Couldn't change 3 files" files={failed} action={retry}
 *   announce="focus" ref={callout}>Halonic kept a copy of each.</Callout>
 */
export function Callout(props: CalloutProps) {
  const ids = { title: useId(), text: useId(), files: useId() };
  const box = useRef<HTMLDivElement>(null);
  useImperativeHandle(props.ref, () => ({
    focus: () => box.current?.focus({ preventScroll: true }),
  }));

  const tone = toneClasses[props.tone];
  const hasTitle = props.title !== undefined && props.title !== "";
  const files = props.files ?? [];
  const focusable = props.announce === "focus";

  return (
    <div
      ref={box}
      {...(focusable ? groupAttributes(ids, hasTitle, files.length > 0) : {})}
      className={`flex gap-2 rounded-sm border border-transparent p-3 ${tone.fill}${focusable ? " focus-ring" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-grid size-icon-sm shrink-0 place-items-center *:size-full ${tone.icon}`}
      >
        {props.icon ?? toneIcons[props.tone]}
      </span>
      <div className="min-w-0 flex-1 wrap-break-word text-fg">
        {hasTitle ? (
          <p id={ids.title} className="text-body-strong">
            {props.title}
          </p>
        ) : null}
        <div id={ids.text} className="text-small">
          {props.children}
        </div>
        {files.length > 0 ? <FileList id={ids.files} files={files} /> : null}
        {props.action === undefined ? null : <CalloutButton action={props.action} />}
      </div>
    </div>
  );
}

/**
 * The group's name is its title, or its text when it has none; its description is the text and
 * the list, without repeating the name.
 */
function groupAttributes(
  ids: { readonly title: string; readonly text: string; readonly files: string },
  hasTitle: boolean,
  hasFiles: boolean,
) {
  const described = [hasTitle ? ids.text : null, hasFiles ? ids.files : null].filter(
    (id) => id !== null,
  );
  return {
    role: "group",
    tabIndex: -1,
    "aria-labelledby": hasTitle ? ids.title : ids.text,
    "aria-describedby": described.length > 0 ? described.join(" ") : undefined,
  };
}

/** A path has no spaces, so it wraps anywhere rather than push the Callout off a phone. */
function FileList({ id, files }: { readonly id: string; readonly files: readonly string[] }) {
  const shown = files.slice(0, CALLOUT_FILES_SHOWN);
  const more = files.length - shown.length;
  return (
    <ul id={id} className="mt-1 list-none text-small">
      {shown.map((file) => (
        <li key={file} className="font-mono wrap-anywhere">
          {file}
        </li>
      ))}
      {more > 0 ? <li>and {more} more</li> : null}
    </ul>
  );
}

/** The ghost action, busy while a returned promise runs, so it keeps focus (17.5). */
function CalloutButton({ action }: { readonly action: CalloutAction }) {
  const [busy, setBusy] = useState(false);

  function run() {
    const result = action.onClick();
    if (result === undefined) {
      return;
    }
    setBusy(true);
    // A rejection is the screen's to report; `finally` passes it on rather than hide it.
    return result.finally(() => setBusy(false));
  }

  return (
    <div className={actionRow}>
      <OnTintContext value={true}>
        <Button variant="ghost" size="sm" busy={busy} onClick={run}>
          {action.label}
        </Button>
      </OnTintContext>
    </div>
  );
}
