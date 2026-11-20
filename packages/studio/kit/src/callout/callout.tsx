import { type ReactNode, type Ref, useId, useImperativeHandle, useRef } from "react";
import { AlertIcon } from "../icons/alert-icon.tsx";
import { InfoIcon } from "../icons/info-icon.tsx";
import { WarningIcon } from "../icons/warning-icon.tsx";
import { CalloutButton } from "./callout-button.tsx";

/**
 * `info` for a fact and maybe a next step (also the "neutral" notices). `warning` when part of
 * something worked, or Halonic kept a copy: nothing was lost. `attention` (amber) for "have a
 * look": over budget, late. `danger` only when something failed and wasn't kept. There's no
 * success tone: a success is a toast.
 */
export type CalloutTone = "info" | "warning" | "attention" | "danger";

/** The Callout's one action, drawn as a ghost button: "Try again". */
export interface CalloutAction {
  readonly label: string;
  /** The label while the promise runs: "Checking…". Without it the label stays. */
  readonly busyLabel?: string;
  /** When it returns a promise, the button is busy until the promise settles. */
  readonly onClick: () => void | Promise<void>;
  /**
   * Where the action takes you when it leaves Studio: "Opens Google Cloud". The label then gets a
   * ↗, the same words are its tooltip, and screen readers hear them after the label.
   */
  readonly opens?: string;
  /**
   * Takes focus when the Callout appears, and is described by the Callout's title and text: for a
   * Callout that stands where focus was, such as the strip of a page whose item went to the trash.
   */
  readonly focus?: boolean;
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
  /** One action, or several side by side ("Keep mine", "Load theirs"). */
  readonly action?: CalloutAction | readonly CalloutAction[];
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

/**
 * A Callout that comes and goes with what the page shows, such as a strip that says the chosen
 * program can't run. Its title, text and files are a polite live region, read out when they
 * appear or change; its action sits outside the region, so "Check again" and "Checking…" aren't
 * read with the text each time. Keep it on the page and pass empty `children` while there's
 * nothing to say: the region has to be there before the words arrive to be read.
 */
interface PoliteCallout extends CalloutBase {
  readonly announce: "polite";
  readonly ref?: never;
}

/** The props of `Callout`. */
export type CalloutProps = QuietCallout | FocusedCallout | PoliteCallout;

/** The number of files shown before "and N more". */
export const CALLOUT_FILES_SHOWN = 3;

/** The fill carries the tone. The transparent edge keeps the box in high contrast (23.5). */
const toneClasses: Record<CalloutTone, { readonly fill: string; readonly icon: string }> = {
  info: { fill: "bg-accent-soft", icon: "text-accent" },
  warning: { fill: "bg-warning-soft", icon: "text-warning" },
  attention: { fill: "bg-attention-soft", icon: "text-attention" },
  danger: { fill: "bg-danger-soft", icon: "text-danger" },
};

const toneIcons: Record<CalloutTone, ReactNode> = {
  info: <InfoIcon />,
  warning: <WarningIcon />,
  attention: <WarningIcon />,
  danger: <AlertIcon />,
};

/**
 * The action's label lines up with the text above it: the margin is minus the button's padding,
 * 10px for `sm`, 16px where `sm` draws as `lg` (a phone, a touch screen).
 */
const actionRow = "mt-2 -ml-2.5 phone:-ml-4 touch:-ml-4";

/**
 * On a phone an action is never wider than the row, so its label wraps instead of being cut
 * (HAL-13770). A button is never wider than its box already (HAL-14010), but with `opens` that
 * box is the Tooltip's wrapper, which is as wide as the label, so the cap goes on the row's child.
 */
const actionRowPhoneWrap = "phone:*:max-w-full";

/**
 * Side by side, two ghost buttons touch. That's fine while only their fills show, but in high
 * contrast each has an outline, and the two would merge into one box (C399 CA1).
 */
const actionRowForcedColours = "forced-colors:gap-1";

/**
 * A message that belongs to one place on a page and stays there until what it's about is dealt
 * with. It has no close button and never cuts its text. As wide as its column.
 *
 * @example
 * <Callout tone="info" icon={<ShieldIcon />}>This workspace isn't trusted yet.</Callout>
 * <Callout tone="warning" title="Couldn't change 3 files" files={failed} action={retry}
 *   announce="focus" ref={callout}>Halonic kept a copy of each.</Callout>
 * <Callout tone="warning" action={checkAgain} announce="polite">{strip}</Callout>
 */
export function Callout(props: CalloutProps) {
  const ids: CalloutIds = { title: useId(), text: useId(), files: useId() };
  const box = useRef<HTMLDivElement>(null);
  useImperativeHandle(props.ref, () => ({
    focus: () => box.current?.focus({ preventScroll: true }),
  }));

  const title = props.title === "" ? undefined : props.title;
  const files = props.files ?? [];
  const focusable = props.announce === "focus";
  // Only a polite Callout is ever empty: it stays on the page as its live region alone.
  const empty = props.announce === "polite" && !hasText(props.children);
  const message = (
    <CalloutMessage ids={ids} title={title} files={files}>
      {props.children}
    </CalloutMessage>
  );

  // An empty polite Callout keeps the same elements without their classes, so React keeps the
  // live region's node when the words come and go.
  return (
    <div
      ref={box}
      {...(focusable ? groupAttributes(ids, title !== undefined, files.length > 0) : {})}
      className={empty ? undefined : boxClass(props.tone, focusable)}
    >
      {empty ? null : <ToneIcon tone={props.tone} icon={props.icon} />}
      <div className={empty ? undefined : "min-w-0 flex-1 wrap-break-word text-fg"}>
        {props.announce === "polite" ? (
          <div role="status" aria-atomic="true">
            {empty ? null : message}
          </div>
        ) : (
          message
        )}
        {empty ? null : (
          <CalloutActions
            action={props.action}
            describedBy={actionDescription(ids, title !== undefined, hasText(props.children))}
          />
        )}
      </div>
    </div>
  );
}

/** The ids the Callout's parts point at each other with. */
interface CalloutIds {
  readonly title: string;
  readonly text: string;
  readonly files: string;
}

/** The box's classes: the tone's fill, and the focus ring when it can take focus. */
function boxClass(tone: CalloutTone, focusable: boolean): string {
  const ring = focusable ? " focus-ring" : "";
  return `flex gap-2 rounded-sm border border-transparent p-3 ${toneClasses[tone].fill}${ring}`;
}

/** The 16px icon in the tone's colour, 2px down so it's centred on the first line. */
function ToneIcon({ tone, icon }: { readonly tone: CalloutTone; readonly icon: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 inline-grid size-icon-sm shrink-0 place-items-center *:size-full ${toneClasses[tone].icon}`}
    >
      {icon ?? toneIcons[tone]}
    </span>
  );
}

/** The words: the title, the text and the files. A polite Callout reads them out together. */
function CalloutMessage({
  ids,
  title,
  files,
  children,
}: {
  readonly ids: CalloutIds;
  readonly title: string | undefined;
  readonly files: readonly string[];
  readonly children: ReactNode;
}) {
  return (
    <>
      {title === undefined ? null : (
        <p id={ids.title} className="text-body-strong">
          {title}
        </p>
      )}
      <div id={ids.text} className="text-small">
        {children}
      </div>
      {files.length > 0 ? <FileList id={ids.files} files={files} /> : null}
    </>
  );
}

/** The action row under the words, or nothing without an action. */
function CalloutActions({
  action,
  describedBy,
}: {
  readonly action: CalloutAction | readonly CalloutAction[] | undefined;
  readonly describedBy: string | undefined;
}) {
  const actions = action === undefined ? [] : [action].flat();
  if (actions.length === 0) {
    return null;
  }
  return (
    <div className={`${actionRow} ${actionRowPhoneWrap} ${actionRowForcedColours} flex flex-wrap`}>
      {actions.map((one) => (
        <CalloutButton key={one.label} action={one} describedBy={describedBy} />
      ))}
    </div>
  );
}

/**
 * What a focused action is described by: the title, then the text, so focus that lands on "Try
 * again" also hears what went wrong. `undefined` when the Callout has neither.
 */
function actionDescription(ids: CalloutIds, hasTitle: boolean, hasWords: boolean) {
  const described = [hasTitle ? ids.title : null, hasWords ? ids.text : null].filter(
    (id) => id !== null,
  );
  return described.length > 0 ? described.join(" ") : undefined;
}

/**
 * The group's name is its title, or its text when it has none; its description is the text and
 * the list, without repeating the name.
 */
function groupAttributes(ids: CalloutIds, hasTitle: boolean, hasFiles: boolean) {
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

/** Whether the text has something to show: not absent, `null`, `false` or `""`. */
function hasText(children: ReactNode): boolean {
  return children !== undefined && children !== null && children !== false && children !== "";
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
