import { Button } from "../../src/button/button.tsx";
import { Card, type CardState } from "../../src/card/card.tsx";
import type { PartSection } from "../state-table.tsx";

/*
 * The kit has no Switch yet (kit 14), so the When card's switch is drawn here: a track and a knob
 * in the sheet's colours. It's only there to show that a paused card's switch keeps its own look.
 */
function SwitchSample({ on }: { readonly on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-9 items-center rounded-full p-0.5 ${on ? "justify-end bg-accent" : "bg-border-strong"}`}
    >
      <span className="size-4 rounded-full bg-surface shadow-1" />
    </span>
  );
}

const meta = "text-small text-fg-muted";
const failed = "text-small text-danger";

function TitleCard({ state = "default" }: { readonly state?: CardState }) {
  const content = {
    default: "Runs every 15 min, on the support inbox.",
    disabled: <span className={meta}>Paused. Turn it on in When.</span>,
    error: <span className={failed}>Last run failed: the model didn't answer.</span>,
  }[state];
  return (
    <div className="w-80 phone:w-full">
      <Card
        title="Mail triage"
        state={state}
        actions={
          <Button variant="ghost" size="sm">
            {state === "error" ? "Open run" : "Edit"}
          </Button>
        }
      >
        {content}
      </Card>
    </div>
  );
}

function LabelCard({ state = "default" }: { readonly state?: CardState }) {
  const paused = state === "disabled";
  return (
    <div className="w-80 phone:w-full">
      <Card label="When" state={state} actions={<SwitchSample on={!paused} />}>
        {paused ? <span className={meta}>Paused since Monday</span> : "Every weekday at 9:00"}
      </Card>
    </div>
  );
}

function InteractiveCard({ state = "default" }: { readonly state?: CardState }) {
  const line = {
    default: <span className={meta}>Runs every 15 min</span>,
    disabled: <span className={meta}>Paused</span>,
    error: <span className={failed}>Last run failed</span>,
  }[state];
  return (
    <div className="w-80 phone:w-full">
      <Card state={state} onClick={() => undefined}>
        <span className="block text-body font-semibold">Mail triage</span>
        {line}
      </Card>
    </div>
  );
}

export const cardSection: PartSection = {
  id: "card",
  number: "7",
  name: "Card",
  order:
    "kit 7 · top to bottom: a title card with one action, a label card (When) with its switch, an interactive card",
  notApplicable: "read-only, busy. Hover and focus: interactive cards only",
  rows: [
    {
      name: "Default",
      copies: () => (
        <>
          <TitleCard />
          <LabelCard />
          <InteractiveCard />
        </>
      ),
    },
    { name: "Hover", force: "hover", copies: () => <InteractiveCard /> },
    { name: "Focus", force: "focus", copies: () => <InteractiveCard /> },
    {
      name: "Disabled",
      copies: () => (
        <>
          <TitleCard state="disabled" />
          <LabelCard state="disabled" />
          <InteractiveCard state="disabled" />
        </>
      ),
    },
    {
      name: "Error",
      copies: () => (
        <>
          <TitleCard state="error" />
          <InteractiveCard state="error" />
        </>
      ),
    },
  ],
};
