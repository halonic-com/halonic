import { type ReactNode, useId } from "react";

/**
 * How the card looks besides its content. `disabled` is for a "Paused" or "Not connected" card,
 * which still says why. `error` is for a card whose content says what failed ("Last run failed").
 */
export type CardState = "default" | "disabled" | "error";

interface CardBase {
  readonly children: ReactNode;
  readonly state?: CardState;
}

/** A card with a header title in `text-section`. */
interface TitleHeader {
  readonly title: ReactNode;
  /** The title's heading level. Default 3: a card sits under its page's own headings. */
  readonly headingLevel?: 2 | 3 | 4;
  readonly label?: never;
}

/** A card with a small caps caption label instead of a title: the routine's When and Starts. */
interface LabelHeader {
  /** Written in sentence case ("When"); CSS draws it in capitals, so it's read as a word. */
  readonly label: string;
  readonly title?: never;
  readonly headingLevel?: never;
}

/** A card with no header: it has nowhere to put actions. */
interface NoHeader {
  readonly title?: never;
  readonly label?: never;
  readonly headingLevel?: never;
  readonly actions?: never;
}

/** Actions belong to a header, so only a card with a title or a label takes them. */
interface HeaderActions {
  /** `sm` ghost buttons or a switch, on the right of the header. */
  readonly actions?: ReactNode;
}

/** A card that shows things, with optional actions on the right of its header. */
type StaticCard = CardBase &
  ((TitleHeader & HeaderActions) | (LabelHeader & HeaderActions) | NoHeader) & {
    readonly onClick?: never;
  };

/** A card that is one button as a whole: one target, so nothing clickable inside. */
type InteractiveCard = CardBase & {
  readonly onClick: () => void;
  readonly title?: never;
  readonly label?: never;
  readonly headingLevel?: never;
  readonly actions?: never;
};

export type CardProps = StaticCard | InteractiveCard;

const stateClasses: Record<CardState, string> = {
  default: "border-border",
  disabled: "border-border",
  error: "border-danger",
};

/**
 * A disabled card fades only its name, so the line that says why ("Paused") stays readable and
 * the header's switch, which turns it back on, keeps its own look. A card with no header has no
 * name to fade, so its box fades instead (component specs 7).
 */
const fadedClasses = "text-fg-disabled";

const box = "rounded-md border bg-surface text-left";

/** Only an interactive card reacts: a lifted edge on hover, the hover fill while pressed. */
const reacts = ["transition", "active:bg-surface-subtle hover:shadow-1"].join(" ");

/**
 * An interactive card's classes by state. A disabled card still opens (to say why it's paused),
 * but it doesn't light up; an error card lifts but keeps its `danger` edge. With more contrast
 * `border-strong` barely differs from the resting edge, so the hover edge goes to `fg-muted` there.
 */
const interactiveClasses: Record<CardState, string> = {
  default: `block w-full focus-ring ${reacts} hover:border-border-strong contrast-more:hover:border-fg-muted`,
  disabled: "block w-full focus-ring",
  error: `block w-full focus-ring ${reacts}`,
};

const headerClasses = "flex items-center gap-3 border-b border-border px-4 py-3";

/**
 * A self-contained summary on a page: a routine, a model provider, a stat. Never a card inside a
 * card. With `onClick` the whole card is one `<button>`; it then holds no buttons of its own, and
 * only phrasing content (text, `<span>`, icons), never a `<div>`, `<p>` or heading.
 *
 * @example
 * <Card title="Model providers" actions={<Button size="sm" variant="ghost">Add</Button>}>…</Card>
 * <Card label="When" actions={onSwitch}>Every weekday at 9:00</Card>
 * <Card onClick={openRoutine}>…</Card>
 */
export function Card(props: CardProps) {
  const state = props.state ?? "default";
  const headerId = useId();

  if (props.onClick !== undefined) {
    const faded = state === "disabled" ? ` ${fadedClasses}` : "";
    const classes = `${box} ${stateClasses[state]}${faded} ${interactiveClasses[state]} p-4`;
    return (
      <button type="button" className={classes} onClick={props.onClick}>
        {props.children}
      </button>
    );
  }

  const header = cardHeader(props, headerId, state === "disabled");
  const actions = isShown(props.actions) ? (
    <div className="ml-auto flex shrink-0 items-center gap-2">{props.actions}</div>
  ) : null;
  const classes = `${box} ${stateClasses[state]}`;
  if (header === null && actions === null) {
    const faded = state === "disabled" ? ` ${fadedClasses}` : "";
    return <div className={`${classes}${faded} p-4`}>{props.children}</div>;
  }
  const body = (
    <>
      <div className={headerClasses}>
        {header}
        {actions}
      </div>
      <div className="p-4">{props.children}</div>
    </>
  );
  // An empty title must never take the card's controls with it: the actions keep their row, in
  // an unnamed card.
  if (header === null) {
    return <div className={classes}>{body}</div>;
  }
  return (
    <section className={classes} aria-labelledby={headerId}>
      {body}
    </section>
  );
}

/** The header's name: a title heading, a caption label, or nothing. */
function cardHeader(props: StaticCard, id: string, faded: boolean): ReactNode {
  if (isShown(props.title)) {
    const Heading = `h${props.headingLevel ?? 3}` as const;
    return (
      <Heading
        id={id}
        className={faded ? `min-w-0 text-section ${fadedClasses}` : "min-w-0 text-section"}
      >
        {props.title}
      </Heading>
    );
  }
  if (isShown(props.label)) {
    return (
      <p
        id={id}
        className={`min-w-0 text-caption font-medium uppercase tracking-label ${faded ? fadedClasses : "text-fg-muted"}`}
      >
        {props.label}
      </p>
    );
  }
  return null;
}

/**
 * True when there's something to show. A screen often writes `title={name && …}` or starts a
 * label as "", and an empty header would still name the section and draw its divider.
 */
function isShown(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== "";
}
