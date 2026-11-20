import { Button, createToastStore } from "@halonicjs/studio-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAnnouncer } from "../../src/announcer/announcer.ts";
import { systemTimers } from "../../src/announcer/timers.ts";
import { createCloseStack } from "../../src/close-stack/close-stack.ts";
import { createShellEngine } from "../../src/engine/engine-connection.ts";
import { ShellFrame } from "../../src/frame/shell-frame.tsx";

/**
 * The frame with a version's page and its **Go back to this version**, which shows the toast it
 * shows in History, with Undo. The button sits low on the page, where at 400 % zoom (195 × 421)
 * the toast at the bottom would cover it (UX check C289, TO1, `kit.toast-clear-of-focus`).
 */
const toasts = createToastStore();
const announcer = createAnnouncer({ timers: systemTimers });

function goBack(): void {
  toasts.show({
    tone: "success",
    title: "Went back to “Sorter replies in Dutch”.",
    text: "Your newer work is kept in History.",
    action: { label: "Undo", onClick: () => undefined },
  });
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The toast placement page needs its #root element (toast-placement.html).");
}
createRoot(root).render(
  <StrictMode>
    <ShellFrame
      announcer={announcer}
      closeStack={createCloseStack()}
      engine={createShellEngine(announcer, systemTimers)}
      toasts={toasts}
      language="en"
      titleBar={<span className="self-center px-2">Halonic Studio</span>}
      phoneTopBar={
        <div className="flex h-14 items-center border-b border-border px-4">History</div>
      }
    >
      <div className="flex flex-col items-start gap-4 p-4">
        <h1>Sorter replies in Dutch</h1>
        <p className="h-48">Changed Sorter and Support reply.</p>
        <Button onClick={goBack}>Go back to this version</Button>
      </div>
    </ShellFrame>
  </StrictMode>,
);
