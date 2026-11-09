import { type ReactNode, useId } from "react";

export interface WindowBarProps {
  /** The file name or the run: `workflows/review.yaml`, `review · run 12`. */
  readonly title: string;
  /** The title's id, so the region the bar heads can be named by it. */
  readonly titleId?: string | undefined;
  /** `sm` ghost buttons on the right of the bar: Copy, Open in editor. */
  readonly actions?: ReactNode;
}

/**
 * The bar is at least 36px, so an `sm` (28px) button fits with 4px above and below. It takes the
 * `surface-subtle` fill of a table header; the site draws it 60% see-through only because its
 * windows sit on tinted rows, which the Studio doesn't have.
 */
const barClasses =
  "flex min-h-9 items-center gap-2 border-b border-border bg-surface-subtle py-1 pr-3 pl-4";

/** A long name wraps rather than losing its end: the bar grows a line in a narrow pane. */
const titleClasses = "min-w-0 font-mono text-caption text-fg-muted wrap-anywhere";

/**
 * The thin header bar of a file view: the file name or the run in small mono text, with optional
 * actions on the right. The same bar as the `window` on halonic.dev, with no window dots. Use it
 * on its own at the top of a pane; use `Window` for a framed file inside a page.
 *
 * @example
 * <WindowBar title="workflows/review.yaml" actions={copyPath} />
 */
export function WindowBar({ title, titleId, actions }: WindowBarProps) {
  return (
    <div className={barClasses}>
      <span id={titleId} className={titleClasses}>
        {title}
      </span>
      {isShown(actions) ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export interface WindowProps extends Omit<WindowBarProps, "titleId"> {
  /** The file or the run's steps. The window adds no padding: what's inside sets its own. */
  readonly children: ReactNode;
}

/**
 * A file or a run shown inside a page, in one plain frame: a bordered `surface` box with a 12px
 * radius, the `WindowBar` on top and the content below. It follows light and dark mode, like the
 * rest of the Studio, and is a region named by its title.
 *
 * @example
 * <Window title="workflows/review.yaml"><pre>…</pre></Window>
 */
export function Window({ title, actions, children }: WindowProps) {
  const titleId = useId();
  const named = title !== "";
  return (
    <section
      aria-labelledby={named ? titleId : undefined}
      className="overflow-hidden rounded-md border border-border bg-surface text-fg"
    >
      <WindowBar title={title} titleId={named ? titleId : undefined} actions={actions} />
      {children}
    </section>
  );
}

/** True when there's something to show: a screen often passes `false` for "no actions". */
function isShown(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== "";
}
