import type { PhonePlaces } from "../phone/use-phone-places.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

/** The context's moves on a place's phone stack, as the window gives them to its views. */
export type PlaceStackMoves = Pick<
  WorkspaceContext,
  "openPlaceList" | "openPlacePage" | "closePlacePage"
>;

/**
 * The moves a view makes on its place's phone stack: a list beside the place's other lists, a
 * page pushed under the place's page, and Back from that page. Each reads `onDesktop` when the
 * view moves, so the context stays the same as the window narrows or widens; on the desktop,
 * which has no stacks, they do nothing.
 *
 * @example
 * const moves = placeStackMoves(onDesktop, phone.open, phone.backFrom);
 * moves.openPlacePage?.("changes", "item:writer", "Writer");
 */
export function placeStackMoves(
  onDesktop: { readonly current: boolean },
  open: PhonePlaces["open"],
  backFrom: PhonePlaces["backFrom"],
): PlaceStackMoves {
  return {
    openPlaceList: (place, sub, title) => {
      if (!onDesktop.current)
        open({ key: `${place}/${sub}`, title }, { list: true, replaceSibling: true });
    },
    openPlacePage: (place, sub, title) => {
      if (!onDesktop.current) open({ key: `${place}/${sub}`, title });
    },
    closePlacePage: (place, sub) => {
      if (!onDesktop.current) backFrom(`${place}/${sub}`);
    },
  };
}
