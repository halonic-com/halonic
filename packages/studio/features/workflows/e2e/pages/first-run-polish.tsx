import { WaitCard, type WaitCardProps } from "@halonicjs/studio-feature-inbox/api";
import { type PhoneTab, PhoneTabBar, PresentationProvider } from "@halonicjs/studio-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * Two screens of the first-run polish (HAL-19399), for the house-style check: `?screen=wait-card`
 * is G8's wait card with two answers, `?screen=tab-bar` is G13's phone tab bar with a count on the
 * picked Inbox tab. `?phone` draws the wait card as on a phone.
 */

const asked = new Date(2026, 10, 25, 14, 2);
const query = new URLSearchParams(window.location.search);
const phone = query.has("phone");

const item: WaitCardProps["item"] = {
  kind: "wait",
  key: "run_fix_issue_4b1e:review",
  runId: "run_fix_issue_4b1e",
  state: "review",
  title: "Review the fix before it opens a pull request",
  body: "The agent changed two files in acme/billing.",
  accepts: ["approve", "reject"],
  answerLabels: {},
  since: asked.toISOString(),
  waitingAt: asked.toISOString(),
  movesOnAt: null,
};

/** A plain 20px square for a tab's icon, filled while the tab is picked. */
function icon(picked: boolean) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect
        x="3"
        y="3"
        width="14"
        height="14"
        rx="3"
        fill={picked ? "currentColor" : "none"}
        stroke="currentColor"
      />
    </svg>
  );
}

const tabs: PhoneTab<"inbox" | "agents">[] = [
  { id: "inbox", label: "Inbox", icon, count: { value: 1, name: "1 waiting" } },
  { id: "agents", label: "Agents", icon },
];

function Screen() {
  if (query.get("screen") === "tab-bar") {
    return (
      <PhoneTabBar label="Acme laptop" tabs={tabs} selected="inbox" onSelect={() => undefined} />
    );
  }
  return (
    <PresentationProvider presentation={phone ? "phone" : "desktop"}>
      <WaitCard
        item={item}
        decisions={{ answer: () => new Promise(() => undefined) }}
        next={null}
        back={null}
        now={() => new Date(asked.getTime() + 3 * 60_000)}
        startedBy="you, with Run"
        onOpenRun={() => undefined}
      />
    </PresentationProvider>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The first-run polish page needs its #root element (first-run-polish.html).");
}
createRoot(root).render(
  <StrictMode>
    {/* The screenshot's frame: the Inbox pane's width at most, as tall as its content. */}
    <div id="shot" className="w-full max-w-[46rem] bg-surface text-fg">
      <Screen />
    </div>
  </StrictMode>,
);
