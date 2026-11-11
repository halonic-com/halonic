/**
 * Renders a frame part into jsdom for a test, the way the Studio renders it: with React's own
 * `createRoot`, inside `act` so effects have run before the test looks. A test that renders starts
 * with `// @vitest-environment jsdom`.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

// Tells React this is a test, so it checks that updates happen inside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

/** Removes everything the test rendered. A test calls it from `afterEach`. */
export function unmountAll(): void {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
}

/** Renders `element` into a fresh container in the document. It's removed after the test. */
export function render(element: ReactNode): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(element));
  return container;
}

/**
 * Renders `element` like {@link render}, in an awaited `act`, for a view that suspends: React
 * retries a suspended view only when the `act` it first rendered in was awaited.
 */
export async function renderSuspending(element: ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(element));
  return container;
}
