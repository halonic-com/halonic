import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import { loadView, type ViewRef } from "./view.ts";

/** One lazy component per view, so a view is imported once, however often it's mounted. */
const lazyViews = new WeakMap<ViewRef, unknown>();

/**
 * The view as a lazy component, the same one each time for the same `ref`. A page or tab that
 * mounts it again draws it at once, without a blank frame or a second `load`.
 */
export function lazyView<Props extends object>(
  ref: ViewRef,
): LazyExoticComponent<ComponentType<Props>> {
  const cached = lazyViews.get(ref) as LazyExoticComponent<ComponentType<Props>> | undefined;
  if (cached !== undefined) return cached;
  const view = lazy(async () => ({ default: await loadView<ComponentType<Props>>(ref) }));
  lazyViews.set(ref, view);
  return view;
}
