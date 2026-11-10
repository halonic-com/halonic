import { ContextMenu, type ContextMenuTarget, type MenuEntry } from "@halonicjs/studio-kit";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

/**
 * The kit's ContextMenu on two tabs, Agents and Support reply, opened by a right-click as the
 * window tab strip opens it (UX checklist 1.2). The menu is named after the tab it is for. Below,
 * a line counts how often the menu closed by itself, so a test sees an `onClose` it didn't ask for.
 * The tabs are wider than the menu, so a menu opened on one tab's middle leaves the next one's
 * middle free to right-click.
 */
const entries: readonly MenuEntry[] = [
  { id: "close", label: "Close", onSelect: () => undefined },
  { id: "close-others", label: "Close other tabs", onSelect: () => undefined },
  { id: "reopen", label: "Reopen closed tab", onSelect: () => undefined },
];

function Tabs() {
  const [target, setTarget] = useState<ContextMenuTarget>();
  const [closes, setCloses] = useState(0);
  return (
    <div className="bg-halo-frame p-2 text-fg">
      <div role="tablist" aria-label="Window tabs" className="flex gap-0.5">
        {["Agents", "Support reply"].map((title) => (
          <div
            key={title}
            role="tab"
            aria-selected={title === "Agents"}
            aria-label={title}
            tabIndex={title === "Agents" ? 0 : -1}
            className="h-9 w-80 px-3 py-2"
            onContextMenu={(event) => {
              event.preventDefault();
              setTarget({
                element: event.currentTarget,
                at: { x: event.clientX, y: event.clientY },
              });
            }}
          >
            {title}
          </div>
        ))}
      </div>
      <ContextMenu
        label={target?.element.getAttribute("aria-label") ?? ""}
        entries={entries}
        target={target}
        onClose={() => {
          setCloses((count) => count + 1);
          setTarget(undefined);
        }}
      />
      <p>Closed by itself: {closes}</p>
    </div>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The context menu page needs its #root element (context-menu.html).");
}
createRoot(root).render(
  <StrictMode>
    <Tabs />
  </StrictMode>,
);
