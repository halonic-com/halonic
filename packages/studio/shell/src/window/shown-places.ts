import { useEffect, useReducer } from "react";
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

/**
 * {@link shownPlaces} for a component, drawn again whenever a place says its signal changed
 * through `subscribeSignal`, so a count or the running dot is current without waiting for anything
 * else to change. Pass the same `places` each render, or it subscribes again each time. It stops
 * listening when the places change or the component goes away.
 *
 * @example
 * const shown = useShownPlaces(places, contextFor);
 */
export function useShownPlaces(
  places: readonly Registered<PlaceContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
): readonly ShownPlace[] {
  const [, signalChanged] = useReducer((changes: number) => changes + 1, 0);
  useEffect(() => {
    const stops = places.flatMap((place) =>
      place.subscribeSignal === undefined
        ? []
        : [place.subscribeSignal(contextFor(place.featureId), signalChanged)],
    );
    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  }, [places, contextFor]);
  return shownPlaces(places, contextFor);
}
