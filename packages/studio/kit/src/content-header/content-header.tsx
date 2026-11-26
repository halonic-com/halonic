import type { ReactNode } from "react";

/** The props of `ContentHeader`. */
export interface ContentHeaderProps {
  /**
   * The 40px picture before the title: an `Avatar` with `size="header"`, or an item's mark at the
   * same size. Decoration: the title says who or what it is.
   */
  readonly picture: ReactNode;
  /** The open item's name: a chat's agent, an Inbox item's question. Cut with an ellipsis. */
  readonly title: string;
  /** One muted line under the title: "Paperclip · Acme · working". Cut with an ellipsis. */
  readonly line?: ReactNode | undefined;
  /** Icon buttons at the end, in order: a find button, a ··· menu. */
  readonly actions?: ReactNode | undefined;
}

/**
 * The header over an open item in a two-pane app, the Messenger's chat and the Inbox's item alike
 * (HAL-19192, `kit.content-header`): a 40px picture, the title as a level-2 heading over one muted
 * line, and the item's actions at the end, above a 1px line.
 *
 * @example
 * <ContentHeader
 *   picture={<Avatar name={agent.name} picture={picture} size="header" />}
 *   title="Chief"
 *   line="Paperclip · Acme · working"
 *   actions={<Menu trigger={moreButton} entries={entries} align="end" />}
 * />
 */
export function ContentHeader({ picture, title, line, actions }: ContentHeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-3">
      {picture}
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="truncate text-body-strong">
          <bdi>{title}</bdi>
        </h2>
        {line === undefined ? null : <p className="truncate text-small text-fg-muted">{line}</p>}
      </div>
      {actions}
    </header>
  );
}
