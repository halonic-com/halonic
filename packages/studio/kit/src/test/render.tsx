/**
 * Renders a component into jsdom for a test, the way the Studio renders it: with React's own
 * `createRoot`, inside `act` so effects and state updates have run before the test looks.
 *
 * Kit tests run in Node by default. A component test starts with `// @vitest-environment jsdom`
 * to get a document; the token tests read files and stay in Node.
 */
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Tells React this is a test, so it checks that updates happen inside act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** What a test gets back: the element the component is in, and a way to render it again. */
export interface Rendered {
  readonly container: HTMLElement;
  rerender(element: ReactNode): void;
}

const mounted: { root: Root; container: HTMLElement }[] = [];

/** Removes everything the test rendered. A test calls it from `afterEach`. */
export function unmountAll(): void {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
}

/** Renders `element` into a fresh container in the document. It's removed after the test. */
export function render(element: ReactNode): Rendered {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(element));
  return {
    container,
    rerender: (next) => act(() => root.render(next)),
  };
}

/** Clicks an element the way a user does, and lets React finish what the click started. */
export async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}
