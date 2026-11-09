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

interface NoHeader {
  readonly title?: never;
  readonly label?: never;
  readonly headingLevel?: never;
}

/** A card that shows things, with optional actions on the right of its header. */
type StaticCard = CardBase &
  (TitleHeader | LabelHeader | NoHeader) & {
    /** `sm` ghost buttons or a switch, on the right of the header. */
    readonly actions?: ReactNode;
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
  disabled: "border-border text-fg-disabled",
  error: "border-danger",
};

const box = "rounded-md border bg-surface text-left";

/** Only an interactive card reacts: a lifted edge on hover, the hover fill while pressed. */
const interactiveClasses = [
  "block w-full transition-colors focus-ring active:bg-surface-subtle",
  "hover:border-border-strong hover:shadow-1",
].join(" ");

const headerClasses = "flex items-center gap-3 border-b border-border px-4 py-3";

/**
 * A self-contained summary on a page: a routine, a model provider, a stat. Never a card inside a
 * card. With `onClick` the whole card is one button; it then holds no buttons of its own.
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
    // A disabled card still opens (to say why it's paused), but it doesn't light up.
    const reacts = state === "disabled" ? "block w-full focus-ring" : interactiveClasses;
    const classes = `${box} ${stateClasses[state]} ${reacts} p-4`;
    return (
      <button type="button" className={classes} onClick={props.onClick}>
        {props.children}
      </button>
    );
  }

  const header = cardHeader(props, headerId);
  const classes = `${box} ${stateClasses[state]}`;
  if (header === null) {
    return <div className={`${classes} p-4`}>{props.children}</div>;
  }
  return (
    <section className={classes} aria-labelledby={headerId}>
      <div className={headerClasses}>
        {header}
        {isShown(props.actions) ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">{props.actions}</div>
        ) : null}
      </div>
      <div className="p-4">{props.children}</div>
    </section>
  );
}

/** The header's name: a title heading, a caption label, or nothing. */
function cardHeader(props: StaticCard, id: string): ReactNode {
  if (isShown(props.title)) {
    const Heading = `h${props.headingLevel ?? 3}` as const;
    return (
      <Heading id={id} className="min-w-0 text-section">
        {props.title}
      </Heading>
    );
  }
  if (isShown(props.label)) {
    return (
      <p
        id={id}
        className="min-w-0 text-caption font-medium uppercase tracking-label text-fg-muted"
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
