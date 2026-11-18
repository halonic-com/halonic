import { act } from "react";
import type { Feature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { StudioWindow } from "../window/studio-window.tsx";
import { StudioWorkspace } from "../window/studio-workspace.ts";
import { FakeTimers } from "./fake-timers.ts";
import { MapTarget } from "./map-target.ts";
import { render } from "./render.tsx";

/** A phone's width, under `PHONE_MAX_WIDTH`. */
export const PHONE_WIDTH = 390;
export const DESKTOP_WIDTH = 1280;

/** Draws the Studio window with `features`, and the ways a test reads and taps its phone bars. */
export function renderPhoneWindow(features: readonly Feature[]) {
  const shell = createShell({ features, timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="served"
      platform="linux"
      language="en"
    />,
  );
  const title = () => container.querySelector("header p")?.textContent;
  const heading = () => container.querySelector("main h1")?.textContent;
  const button = (name: string) =>
    container.querySelector<HTMLButtonElement>(`header button[aria-label="${name}"]`);
  const tapPlace = (name: string) =>
    act(() =>
      container
        .querySelector<HTMLElement>(`nav[aria-label="Places"] a[aria-label^="${name}"]`)
        ?.click(),
    );
  const openUnderMore = async (name: string) => {
    tapPlace("More");
    const row = [...container.querySelectorAll("main tr")].find((candidate) =>
      candidate.textContent?.includes(name),
    );
    act(() => row?.querySelector<HTMLElement>("[role=gridcell]")?.click());
    await settle();
  };
  return { container, workspace, title, heading, button, tapPlace, openUnderMore };
}

/** Lets the lazily imported views resolve and React draw them. */
export async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
