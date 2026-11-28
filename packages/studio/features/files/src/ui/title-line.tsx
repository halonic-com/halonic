import type { ReactNode } from "react";

/** Props for {@link TitleLine}. */
export interface TitleLineProps {
  /** The page's title, as Code's list column has it; the sidebar's tree has none. */
  readonly title: string | undefined;
  /** The + button, or nothing while the tree loads or can't load. */
  readonly children?: ReactNode;
}

/**
 * The tree's top line: the page's title at its start, when it has one, and the + button at its
 * end. Code's page shows its title in every state, so the rail's focus has an `h1` to land on
 * (`files.code-page`); the sidebar's tree draws nothing here until it has the + to show.
 */
export function TitleLine({ title, children }: TitleLineProps) {
  if (title === undefined) {
    if (children === undefined) return null;
    return <div className="flex items-center justify-end px-2.5 pt-1">{children}</div>;
  }
  return (
    <div className="flex items-center justify-between px-2.5 pt-1">
      <h1 tabIndex={-1} className="ps-2.5 text-title">
        {title}
      </h1>
      {children}
    </div>
  );
}
