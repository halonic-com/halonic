// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { mountStudioWindow } from "./mount-studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

let restoreMedia: () => void;
let element: HTMLDivElement;

beforeEach(() => {
  restoreMedia = new FakeMediaQueries(1280).install();
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  element.remove();
  restoreMedia();
});

/** Mounts a window for a workspace with no features into the page's element. */
function mount() {
  const shell = createShell({ features: [], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  let studio: ReturnType<typeof mountStudioWindow> | undefined;
  act(() => {
    studio = mountStudioWindow(element, {
      shell,
      workspace,
      host: "served",
      platform: "linux",
      language: "en",
    });
  });
  return { unmount: () => act(() => studio?.unmount()) };
}

verifies("shell.studio-mount", () => {
  it("draws the Studio window into the element, on Home", () => {
    mount();

    expect(element.querySelector('[role="tablist"][aria-label="Open tabs"]')).not.toBeNull();
    expect(element.querySelector("main h1")?.textContent).toBe("Home");
  });

  it("leaves the element empty once unmounted", () => {
    const studio = mount();

    studio.unmount();

    expect(element.childElementCount).toBe(0);
  });
});
