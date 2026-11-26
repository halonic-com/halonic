// @vitest-environment jsdom

import { TimeStamp } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { FakeChosenFormat } from "../test-support/fake-chosen-format.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

let media: FakeMediaQueries;
let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(1280);
  restoreMedia = media.install();
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia();
  vi.restoreAllMocks();
});

/** A Home card showing 09:41 today with no locale of its own, so it follows the window's. */
function ClockCard() {
  return <TimeStamp at={new Date(2026, 10, 26, 9, 41)} now={new Date(2026, 10, 26, 12, 0)} />;
}

const clockFeature = defineFeature({
  id: "clock",
  title: "Clock",
  register(studio) {
    studio.home.addCard({ id: "needs-you", view: "ClockCard", load: async () => ({ ClockCard }) });
  },
});

/** The time the card shows in a window given `regionFormat`, once its view has loaded. */
async function shownTime(regionFormat?: string, chosenFormat?: FakeChosenFormat) {
  const shell = createShell({ features: [clockFeature], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
      regionFormat={regionFormat}
      chosenFormat={chosenFormat}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container.querySelector("time")?.textContent;
}

verifies("kit.time-stamp", () => {
  it("gives its times the system's region format, over the browser's language", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    expect(await shownTime("en_GB.UTF-8")).toBe("09:41");
  });

  it("follows the browser's language when it has no region format", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    expect(await shownTime()).toBe("9:41 AM");
    unmountAll();
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
    expect(await shownTime()).toBe("09:41");
  });

  it("follows the format chosen in Settings → Formats over the region, and a new choice at once", async () => {
    const chosen = new FakeChosenFormat("en-US");
    expect(await shownTime("en_GB.UTF-8", chosen)).toBe("9:41 AM");

    act(() => chosen.choose(undefined));
    expect(document.querySelector("time")?.textContent).toBe("09:41");
  });
});
