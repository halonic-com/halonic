// @vitest-environment jsdom

import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { createCloseStack } from "../close-stack/close-stack.ts";
import { createShellEngine } from "../engine/engine-connection.ts";
import { ShellFrame } from "../frame/shell-frame.tsx";
import { showPlace } from "../points/frame.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { BottomNavigation, type BottomNavigationPlace } from "./bottom-navigation.tsx";
import { PhoneTopBar } from "./phone-top-bar.tsx";

let media: FakeMediaQueries;
let uninstall: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(400);
  uninstall = media.install();
});

afterEach(() => {
  unmountAll();
  uninstall();
});

const places = [
  showPlace("home", undefined),
  showPlace("inbox", { mark: "count", value: 3, spoken: "3 waiting" }),
  showPlace("workflows", undefined),
  showPlace("runs", { mark: "running", value: 1, spoken: "1 running" }),
];

function renderNavigation(current: BottomNavigationPlace, shown = places) {
  const picked: BottomNavigationPlace[] = [];
  const container = render(
    <BottomNavigation places={shown} current={current} onSelect={(place) => picked.push(place)} />,
  );
  const links = [...container.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Places"] a')];
  const link = (place: string) =>
    links.find((a) => a.getAttribute("aria-label")?.startsWith(place)) as HTMLAnchorElement;
  return { container, picked, links, link };
}

verifies("shell.phone-bars", () => {
  it("shows the top bar, the page and the bottom navigation in that order on a phone", () => {
    const timers = new FakeTimers();
    const announcer = createAnnouncer({ timers });
    const container = render(
      <ShellFrame
        announcer={announcer}
        closeStack={createCloseStack()}
        engine={createShellEngine(announcer, timers)}
        toasts={createToastStore()}
        language="en"
        toolbar={<button type="button">Forward</button>}
        phoneTopBar={<PhoneTopBar title="Inbox" />}
        phoneNavigation={<BottomNavigation places={places} current="inbox" onSelect={() => {}} />}
      >
        <h1>Needs you</h1>
      </ShellFrame>,
    );
    const column = container.querySelector('[data-layout="phone"] > div') as HTMLElement;
    const rows = [...column.children];
    expect(rows[0]?.tagName).toBe("HEADER");
    expect(rows[0]?.textContent).toBe("Inbox");
    expect(rows.at(-1)?.tagName).toBe("NAV");
    expect(column.querySelector("main")?.textContent).toBe("Needs you");
    expect(container.textContent).not.toContain("Forward");

    act(() => media.resize(1440));
    expect(container.querySelector("nav")).toBeNull();
    expect(container.textContent).not.toContain("Inbox");
    expect(container.textContent).toContain("Forward");
  });

  it("shows Back before the title under the top of a place, and goes back when it's pressed", () => {
    let backs = 0;
    const container = render(<PhoneTopBar title="Support reply" onBack={() => backs++} />);
    const bar = container.querySelector("header") as HTMLElement;
    const back = bar.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    expect(bar.firstElementChild).toBe(back);
    expect(bar.querySelector("p")?.textContent).toBe("Support reply");
    expect(bar.querySelector("p")?.className).toContain("truncate");
    expect(bar.className).toContain("min-h-phone-bar");
    expect(bar.className).toContain("pt-safe");
    act(() => back.click());
    expect(backs).toBe(1);
  });

  it("shows no Back at the top of a place, and the title starts 16px in", () => {
    const container = render(
      <PhoneTopBar title="Inbox" actions={<button type="button">Search</button>} />,
    );
    expect(container.querySelector('button[aria-label="Back"]')).toBeNull();
    expect(container.querySelector("p")?.className).toContain("ps-3");
    expect(container.querySelector("header")?.lastElementChild?.textContent).toBe("Search");
  });

  it("names each place with its signal, in the fixed order, and marks where you are", () => {
    const { links, link, container } = renderNavigation("inbox");
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual([
      "Home",
      "Inbox, 3 waiting",
      "Runs, 1 running",
      "More",
    ]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null, null]);
    expect(link("Inbox").querySelector("[data-place-icon]")?.getAttribute("data-place-icon")).toBe(
      "inbox-filled",
    );
    expect(link("Home").querySelector("[data-place-icon]")?.getAttribute("data-place-icon")).toBe(
      "home",
    );
    const nav = container.querySelector("nav") as HTMLElement;
    expect(nav.className).toContain("min-h-phone-bar");
    expect(nav.className).toContain("pb-safe-inset");
  });

  it("draws the count and the running dot at the icon, hidden from the link's name", () => {
    const { link } = renderNavigation("home");
    const count = link("Inbox").querySelector('[aria-hidden="true"].absolute');
    expect(count?.textContent).toContain("3");
    const dot = link("Runs").querySelector('[aria-hidden="true"].absolute');
    expect(dot?.className).toContain("bg-running");
    expect(link("More").querySelector(".absolute")).toBeNull();
  });

  it("shows only the places the features added, and More always", () => {
    const { links } = renderNavigation("home", [showPlace("home", undefined)]);
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual(["Home", "More"]);
  });

  it("passes a tap on its place on", () => {
    const { link, picked } = renderNavigation("inbox");
    act(() => link("Runs").click());
    act(() => link("Inbox").click());
    expect(picked).toEqual(["runs", "inbox"]);
  });
});
