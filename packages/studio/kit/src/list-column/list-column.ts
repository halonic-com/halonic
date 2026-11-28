/**
 * The size of a new-design screen's list column, the one value every screen uses so a later size
 * change is one edit (`kit.list-column`, decided on HAL-20769): 34% of the room it sits in, at
 * most 380px, and never under 208px, so the Inbox beside Studio's sidebar keeps a readable
 * column at the 900px window edge.
 *
 * @example
 * <nav className={`${listColumnClass} shrink-0 overflow-y-auto`}>…</nav>
 */
export const listColumnClass = "w-[34%] min-w-52 max-w-95";
