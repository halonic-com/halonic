import { createToastStore } from "@halonicjs/studio-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAnnouncer } from "../../src/announcer/announcer.ts";
import { systemTimers } from "../../src/announcer/timers.ts";
import { createCloseStack } from "../../src/close-stack/close-stack.ts";
import { createShellEngine } from "../../src/engine/engine-connection.ts";
import { ShellFrame } from "../../src/frame/shell-frame.tsx";
import {
  BottomNavigation,
  type BottomNavigationPlace,
} from "../../src/phone/bottom-navigation.tsx";
import { PhoneTopBar } from "../../src/phone/phone-top-bar.tsx";
import { showPlace } from "../../src/points/frame.ts";

/**
 * The phone's frame with its real top bar and bottom navigation, the user in the place the
 * `place` query parameter names: `home` (the default), `inbox`, `runs` or `more`. Inbox carries
 * its count and Runs the running dot, so every item has its widest look.
 */
const places = [
  showPlace("home", undefined),
  showPlace("inbox", { mark: "count", value: 12, spoken: "12 waiting" }),
  showPlace("runs", { mark: "running", value: 1, spoken: "1 running" }),
];
const titles: Record<BottomNavigationPlace, string> = {
  home: "Home",
  inbox: "Inbox",
  runs: "Runs",
  more: "More",
};
const asked = new URLSearchParams(location.search).get("place");
const current: BottomNavigationPlace =
  asked === "inbox" || asked === "runs" || asked === "more" ? asked : "home";

const announcer = createAnnouncer({ timers: systemTimers });

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The bottom navigation page needs its #root element (bottom-navigation.html).");
}
createRoot(root).render(
  <StrictMode>
    <ShellFrame
      announcer={announcer}
      closeStack={createCloseStack()}
      engine={createShellEngine(announcer, systemTimers)}
      toasts={createToastStore()}
      language="en"
      phoneTopBar={<PhoneTopBar title={titles[current]} />}
      phoneNavigation={
        <BottomNavigation places={places} current={current} onSelect={() => undefined} />
      }
    >
      <h1 className="p-4">{titles[current]}</h1>
    </ShellFrame>
  </StrictMode>,
);
