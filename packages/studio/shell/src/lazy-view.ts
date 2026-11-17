import { type ComponentType, type LazyExoticComponent, lazy, useCallback, useState } from "react";
import { loadView, type ViewRef } from "./view.ts";

/** One lazy component per view, so a view is imported once, however often it's mounted. */
const lazyViews = new WeakMap<ViewRef, unknown>();

/**
 * The view as a lazy component, the same one each time for the same `ref`. A page or tab that
 * mounts it again draws it at once, without a blank frame or a second `load`. A view whose import
 * failed is forgotten, since `lazy` keeps a failed import: the next mount, such as after
 * **Reload page**, imports it again.
 */
export function lazyView<Props extends object>(
  ref: ViewRef,
): LazyExoticComponent<ComponentType<Props>> {
  const cached = lazyViews.get(ref) as LazyExoticComponent<ComponentType<Props>> | undefined;
  if (cached !== undefined) return cached;
  const view = lazy(async () => {
    try {
      return { default: await loadView<ComponentType<Props>>(ref) };
    } catch (error) {
      forget(ref, view);
      throw error;
    }
  });
  lazyViews.set(ref, view);
  return view;
}

/**
 * {@link lazyView}, with `retry` for **Try again** while it is still loading: it drops the import
 * that is taking long and starts a new one.
 */
export function useLazyView<Props extends object>(
  ref: ViewRef,
): {
  readonly View: LazyExoticComponent<ComponentType<Props>>;
  readonly retry: () => void;
} {
  const [, setAttempt] = useState(0);
  const View = lazyView<Props>(ref);
  const retry = useCallback(() => {
    forget(ref, View);
    setAttempt((count) => count + 1);
  }, [ref, View]);
  return { View, retry };
}

/** Forgets `ref`'s lazy component if it is still `view`, so the next `lazyView` imports again. */
function forget(ref: ViewRef, view: unknown): void {
  if (lazyViews.get(ref) === view) lazyViews.delete(ref);
}
