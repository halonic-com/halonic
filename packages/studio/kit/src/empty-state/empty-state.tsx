import type { ReactNode, Ref } from "react";
import { Button, type ButtonSize } from "../button/button.tsx";
import { AlertIcon } from "../icons/alert-icon.tsx";

/**
 * `default` says there's nothing here yet. `error` says something couldn't load, so a screen never
 * confuses "nothing here" with "something broke".
 */
export type EmptyStateTone = "default" | "error";

/** One of the Empty state's buttons. The Empty state picks its variant and size. */
export interface EmptyStateAction {
  /** A verb that says what happens: "New agent", "Try again". */
  readonly label: string;
  readonly onClick: () => void;
  /** While its request runs, such as Try again while the list loads again. */
  readonly busy?: boolean;
}

interface EmptyStateBase {
  /** "No agents yet", "No results for “sorter”", "Couldn't load agents". */
  readonly title: string;
  /** One or two sentences that say what the thing is for; for an error, the reason. */
  readonly description?: ReactNode;
  /** The title's heading level. Default 2: the Empty state stands in for a page's content. */
  readonly headingLevel?: 2 | 3 | 4;
  /**
   * The title, which takes focus when the last row of a list goes while focus was in it
   * (component specs 23 A2). It has `tabindex="-1"`, so only code can focus it.
   */
  readonly titleRef?: Ref<HTMLHeadingElement>;
}

/** Nothing here yet: an optional icon tile, the halo wash, and up to two buttons. */
interface Nothing extends EmptyStateBase {
  readonly tone?: "default";
  readonly align?: "center";
  /** A 20px icon, drawn in `accent` on a tile. Without one there's no tile. */
  readonly icon?: ReactNode;
  /** For no search results and small panels: no wash and no tile, only the text. */
  readonly plain?: boolean;
  /** The one primary button: "New agent". */
  readonly action?: EmptyStateAction;
  /** An optional second way in: "Start from a template". */
  readonly secondaryAction?: EmptyStateAction;
}

/** Something couldn't load, in the space it would have filled. */
interface CentredError extends EmptyStateBase {
  readonly tone: "error";
  readonly align?: "center";
  readonly icon?: never;
  /** Inside a small panel or the width of a file tree: no wash and no tile. */
  readonly plain?: boolean;
  /** Try again. */
  readonly action?: EmptyStateAction;
  readonly secondaryAction?: never;
}

/**
 * Something in one section of a page couldn't load (Home's Recent runs): left-aligned, so the
 * whole page doesn't look broken.
 */
interface SectionError extends EmptyStateBase {
  readonly tone: "error";
  readonly align: "start";
  readonly icon?: never;
  readonly plain?: never;
  /** Try again. */
  readonly action?: EmptyStateAction;
  readonly secondaryAction?: never;
}

export type EmptyStateProps = Nothing | CentredError | SectionError;

/** The title can take focus from code (A2), but it isn't a control, so it draws no ring. */
const titleFocus = "outline-none";

/** The alert mark next to an error's title when there's no tile for it. */
const inlineAlert = "inline-grid size-icon-md shrink-0 place-items-center *:size-full text-danger";

/**
 * A list, page or panel with nothing in it yet, or a search with no results; with
 * `tone="error"`, the same place when it couldn't load. Centred in the space it replaces. Its
 * buttons are `md`, which the Button itself draws at 40px on a phone and a touch screen.
 *
 * @example
 * <EmptyState icon={<AgentIcon />} title="No agents yet" description="…" action={newAgent} />
 * <EmptyState tone="error" title="Couldn't load agents" description={reason} action={retry} />
 * <EmptyState tone="error" align="start" title="Couldn't load recent runs" action={retry} />
 */
export function EmptyState(props: EmptyStateProps) {
  if (props.align === "start") {
    return <SectionErrorState {...props} />;
  }

  const error = props.tone === "error";
  const plain = props.plain === true;
  const Heading = `h${props.headingLevel ?? 2}` as const;
  const tile = plain ? null : iconTile(error ? <AlertIcon /> : props.icon, error);
  const primary = error ? "secondary" : "primary";

  return (
    <div
      className={`grid min-h-full w-full place-items-center px-4 py-8 ${plain ? "" : "bg-halo-wash"}`}
    >
      <div className="flex max-w-empty flex-col items-center gap-1.5 text-center">
        {tile}
        <Heading
          ref={props.titleRef}
          tabIndex={-1}
          className={`flex items-start gap-2 text-section ${titleFocus}`}
        >
          {error && plain ? (
            <span className={inlineAlert}>
              <AlertIcon />
            </span>
          ) : null}
          {props.title}
        </Heading>
        {isShown(props.description) ? (
          <p className="text-body text-fg-muted">{props.description}</p>
        ) : null}
        {props.action !== undefined || props.secondaryAction !== undefined ? (
          <div className="mt-1.5 flex flex-wrap justify-center gap-2">
            {actionButton(props.action, primary, "md")}
            {actionButton(props.secondaryAction, "secondary", "md")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** `align="start"`: the alert mark inline with the title, the reason, then Try again. */
function SectionErrorState({ title, description, headingLevel, titleRef, action }: SectionError) {
  const Heading = `h${headingLevel ?? 2}` as const;
  return (
    <div className="flex flex-col items-start gap-1.5 px-4 py-3 text-left">
      <Heading
        ref={titleRef}
        tabIndex={-1}
        className={`flex items-start gap-2 text-body-strong ${titleFocus}`}
      >
        <span className={inlineAlert}>
          <AlertIcon />
        </span>
        {title}
      </Heading>
      {isShown(description) ? <p className="text-small text-fg-muted">{description}</p> : null}
      {action === undefined ? null : (
        <div className="mt-1.5">{actionButton(action, "secondary", "lg")}</div>
      )}
    </div>
  );
}

/**
 * The 40px tile behind the icon. It's decoration (23 A10): the title says the same. With no
 * icon there's no tile.
 */
function iconTile(icon: ReactNode, error: boolean): ReactNode {
  if (!isShown(icon)) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className={`mb-1.5 grid size-10 place-items-center rounded-md bg-surface shadow-1 ${error ? "text-danger" : "text-accent"}`}
    >
      <span className="inline-grid size-icon-md place-items-center *:size-full">{icon}</span>
    </div>
  );
}

function actionButton(
  action: EmptyStateAction | undefined,
  variant: "primary" | "secondary",
  size: ButtonSize,
): ReactNode {
  if (action === undefined) {
    return null;
  }
  return (
    <Button variant={variant} size={size} busy={action.busy === true} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

/** True when there's something to show: a screen often passes `""` or `false` for "no text". */
function isShown(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== "";
}
