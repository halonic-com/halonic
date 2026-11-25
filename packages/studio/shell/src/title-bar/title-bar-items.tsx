import { StatusBarItems, type StatusBarItemsProps } from "../frame/status-bar.tsx";

/**
 * The items features add to the title bar (`studio.titleBar`), such as the account menu of a
 * served Studio with many users, at the title bar's right end (`shell.title-bar-items`). With no
 * items it draws nothing; an item whose view draws nothing takes no room. An item's view gets the
 * same props as a status bar item's.
 *
 * @example
 * <TitleBarItems items={shell.contributions.titleBar.list()} contextFor={contextFor} />
 */
export function TitleBarItems({ items, contextFor }: StatusBarItemsProps) {
  if (items.length === 0) {
    return null;
  }
  return (
    <span className="ms-auto flex items-center gap-1 self-center pe-1">
      <StatusBarItems items={items} contextFor={contextFor} />
    </span>
  );
}
