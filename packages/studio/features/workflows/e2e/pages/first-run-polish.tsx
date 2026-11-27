import { type PhoneTab, PhoneTabBar, PlaceIcon } from "@halonicjs/studio-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * G13's phone tab bar from the first-run polish (HAL-19399), for the house-style check: the Inbox
 * tab with the Studio's own icons and the count `?count=` gives (1 by default), so a one- and a
 * two-digit count can be checked against the icon. `?picked=home` picks Home, to show the count on
 * an Inbox tab that isn't picked.
 */

const query = new URLSearchParams(window.location.search);
const count = Number(query.get("count") ?? "1");
const picked = query.get("picked") === "home" ? "home" : "inbox";

const tabs: PhoneTab<"home" | "inbox" | "runs">[] = [
  { id: "home", label: "Home", icon: (filled) => <PlaceIcon name="home" filled={filled} /> },
  {
    id: "inbox",
    label: "Inbox",
    icon: (filled) => <PlaceIcon name="inbox" filled={filled} />,
    count: { value: count, name: `${count} waiting` },
  },
  { id: "runs", label: "Runs", icon: (filled) => <PlaceIcon name="runs" filled={filled} /> },
];

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The first-run polish page needs its #root element (first-run-polish.html).");
}
createRoot(root).render(
  <StrictMode>
    <div className="bg-surface text-fg">
      <PhoneTabBar label="Acme laptop" tabs={tabs} selected={picked} onSelect={() => undefined} />
    </div>
  </StrictMode>,
);
