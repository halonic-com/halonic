import { type PlaceContribution, type ShownPlace, showPlace } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

/**
 * The places features added, as the sidebar, the bottom navigation and the More page show them:
 * each with its signal, read through the context of the feature that added it.
 *
 * @example
 * shownPlaces(shell.contributions.places.list(), (featureId) => shell.services.contextFor(featureId, workspace.services));
 */
export function shownPlaces(
  places: readonly Registered<PlaceContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
): readonly ShownPlace[] {
  return places.map((place) => showPlace(place.id, place.signal?.(contextFor(place.featureId))));
}
