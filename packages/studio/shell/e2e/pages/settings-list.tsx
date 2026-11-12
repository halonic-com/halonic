import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { SettingsListPage } from "../../src/phone/settings-list-page.tsx";
import type { SettingsSectionContribution } from "../../src/points/frame.ts";
import type { Registered } from "../../src/points/point-store.ts";
import { focusPageHeading } from "../../src/tabs/history-moves.ts";
import type { WorkspaceContext } from "../../src/workspace-context.ts";

/**
 * The phone's Settings list in a short, scrolling `main`, for Back: "Open" draws another page in
 * its place, and "Back" draws the list again and moves focus to its heading, as the window does.
 * The list must come back at the scroll it had, which only a real browser shows (a focused heading
 * is scrolled into view there).
 */
const load = async () => ({ View: () => null });
const sections: Registered<SettingsSectionContribution>[] = Array.from(
  { length: 30 },
  (_, index) => ({
    id: `section-${index}`,
    title: `Section ${index}`,
    scope: index < 10 ? "workspace" : "display",
    order: index,
    view: "View",
    load,
    featureId: "e2e",
  }),
);

function Page() {
  const [open, setOpen] = useState(false);
  const scroll = useRef(0);
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex gap-2">
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            requestAnimationFrame(() => focusPageHeading());
          }}
        >
          Back
        </button>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {open ? (
          <h1 tabIndex={-1}>A section</h1>
        ) : (
          <SettingsListPage
            sections={sections}
            workspaceName="Acme"
            place="served"
            contextFor={() => ({}) as WorkspaceContext}
            scroll={scroll}
            onOpen={() => setOpen(true)}
          />
        )}
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The settings list page needs its #root element (settings-list.html).");
}
createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
