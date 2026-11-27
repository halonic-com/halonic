// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { type PlaceSignal, showPlace } from "../points/frame.ts";
import { TabSet } from "../tabs/tab-set.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PlacesList } from "./places-list.tsx";

afterEach(unmountAll);

/** The sidebar with the Inbox's signal: the Inbox link and its name's own span. */
function renderInbox(signal: PlaceSignal) {
  const announcer = createAnnouncer({ timers: new FakeTimers() });
  const container = render(
    <PlacesList
      places={[showPlace("home", undefined), showPlace("inbox", signal)]}
      tabs={new TabSet()}
      announcer={announcer}
    />,
  );
  const link = [...container.querySelectorAll("nav a")].find((a) =>
    a.textContent?.startsWith("Inbox"),
  ) as HTMLAnchorElement;
  const name = [...link.querySelectorAll("span")].find((span) => span.textContent === "Inbox");
  return { link, name };
}

verifies("shell.place-new-signal", () => {
  it("shows the new count after the name, sets the name semibold, and speaks its words", () => {
    const { link, name } = renderInbox({ mark: "new", value: 3, spoken: "3 new, 8 waiting" });
    // The chip's words follow its number, for a screen reader.
    expect(link.textContent).toBe("Inbox3, 3 new, 8 waiting");
    expect(name?.className.split(" ")).toContain("font-semibold");
    expect(
      showPlace("inbox", { mark: "new", value: 3, spoken: "3 new, 8 waiting" }).spokenName,
    ).toBe("Inbox, 3 new, 8 waiting");
  });

  it("shows no count and a regular name while nothing is new", () => {
    const { link, name } = renderInbox({ mark: "new", value: 0, spoken: "0 new, 8 waiting" });
    expect(link.textContent).toBe("Inbox");
    expect(name?.className.split(" ")).not.toContain("font-semibold");
    expect(
      showPlace("inbox", { mark: "new", value: 0, spoken: "0 new, 8 waiting" }).spokenName,
    ).toBe("Inbox");
  });

  it("keeps a plain count's name at regular weight", () => {
    const { name } = renderInbox({ mark: "count", value: 2, spoken: "2 waiting" });
    expect(name?.className.split(" ")).not.toContain("font-semibold");
  });
});
