/** A chat Home's list shows: its id and the title its row shows. */
export interface ListedChat {
  readonly id: string;
  readonly title: string;
}

/**
 * The chat Home's content pane keeps open after the list changed (`home.content-pane`). A chat that
 * was listed and is gone, deleted here or elsewhere, closes, so the pane shows Home's sections
 * again. A chat never listed yet stays open: a new chat isn't listed until its first message.
 */
export function keptOpenChat(
  open: string | undefined,
  before: readonly ListedChat[] | undefined,
  after: readonly ListedChat[],
): string | undefined {
  if (open === undefined) return undefined;
  const wasListed = before?.some((chat) => chat.id === open) ?? false;
  const isListed = after.some((chat) => chat.id === open);
  return wasListed && !isListed ? undefined : open;
}
