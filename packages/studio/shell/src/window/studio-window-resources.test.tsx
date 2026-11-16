// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { type ResourceWatch, watchResources } from "../resources/resource-watch.ts";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

let restoreMediaQueries: () => void;
let watch: ResourceWatch;

beforeEach(() => {
  restoreMediaQueries = new FakeMediaQueries(1440).install();
  watch = watchResources({
    timers: new FakeTimers(),
    onError: (error) => {
      throw error;
    },
    read: async () => ({
      engineMemoryBytes: 230 * 1024 ** 2,
      childProcesses: [],
      dataBytes: 0,
      freeDiskBytes: 48 * 1024 ** 3,
    }),
  });
});

afterEach(() => {
  watch.stop();
  unmountAll();
  restoreMediaQueries();
});

async function renderStatusBar(host: "desktop-app" | "served"): Promise<string> {
  const shell = createShell({
    features: [defineFeature({ id: "runs", title: "Runs", register: () => {} })],
    timers: new FakeTimers(),
  });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={new StudioWorkspace({ toasts: shell.toasts, services })}
      host={host}
      platform="windows"
      language="en"
      resources={watch}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container.querySelector("footer")?.textContent ?? "";
}

verifies("shell.resource-status-item", () => {
  it("shows the item in the desktop app's status bar", async () => {
    expect(await renderStatusBar("desktop-app")).toContain("230 MB · 48 GB free");
  });

  it("leaves the item out of a served browser", async () => {
    expect(await renderStatusBar("served")).not.toContain("GB free");
  });
});
