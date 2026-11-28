// @vitest-environment jsdom
import type { AiChats } from "@halonicjs/studio-feature-assistant/api";
import { EngineNotAnswering, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { HomeListColumn } from "./home-list-column.tsx";

/*
 * Where Home's failure line puts Try again in the scrolling list column (HAL-21045). The rest of
 * the line's behaviour is in home-view.test.tsx.
 */

let root: Root | undefined;
let element: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
  root = undefined;
  element = undefined;
});

/** Home's list column with chats that can't be read. */
async function showFailure(): Promise<HTMLElement> {
  const service: AiChats = {
    list: async () => Promise.reject(new EngineNotAnswering()),
    subscribe: () => () => undefined,
    newChat: vi.fn(async () => "new-chat"),
    open: vi.fn(() => () => undefined),
    openInTab: vi.fn(),
    render: () => null,
  };
  const services = { get: () => service, find: () => service };
  const context = { services, announcer: { announce: vi.fn() } } as unknown as WorkspaceContext;
  element = document.createElement("div");
  document.body.append(element);
  const shown = element;
  root = createRoot(shown);
  await act(async () =>
    root?.render(<HomeListColumn context={context} open={undefined} setOpen={() => undefined} />),
  );
  return shown;
}

verifies("home.list-column", () => {
  it("keeps Try again and its focus ring inside the scrolling column at every pointer", async () => {
    const page = await showFailure();
    const tryAgain = [...page.querySelectorAll("button")].find(
      (each) => each.textContent?.includes("Try again") === true,
    ) as HTMLElement;
    const line = tryAgain.parentElement?.parentElement as HTMLElement;
    // The line's start padding is the pull, so the button's edge sits on the column's edge, never past.
    const lineClasses = line.className.split(" ");
    for (const padding of ["ps-3.25", "phone:ps-4.25", "touch:ps-4.25"]) {
      expect(lineClasses).toContain(padding);
    }
    expect(lineClasses).not.toContain("px-3");
    // Whole classes: "focus-ring" is a substring of "focus-ring-inset".
    const buttonClasses = tryAgain.className.split(" ");
    expect(buttonClasses).toContain("focus-ring-inset");
    expect(buttonClasses).not.toContain("focus-ring");
  });
});
