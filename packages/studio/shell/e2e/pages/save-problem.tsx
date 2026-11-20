import { createToastStore } from "@halonicjs/studio-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAnnouncer } from "../../src/announcer/announcer.ts";
import { systemTimers } from "../../src/announcer/timers.ts";
import { createBadgeRegistry, trustBadgePriority } from "../../src/badges/badge-registry.ts";
import { HeaderBadges } from "../../src/badges/header-badges.tsx";
import { createCloseStack } from "../../src/close-stack/close-stack.ts";
import { createShellEngine } from "../../src/engine/engine-connection.ts";
import { ShellFrame } from "../../src/frame/shell-frame.tsx";
import { StatusBarSaveNote } from "../../src/frame/status-bar-save-note.tsx";
import { SaveState } from "../../src/save/save-state.ts";

/**
 * The frame with the real save note, in the state the `state` query parameter names: `saved`
 * (the default), `fields`, `items` or `failed`. `title=long` gives the failed item a long title.
 * On the desktop the status bar takes the problem's fill; on a phone the strip under the top bar
 * shows it. `badges=on` adds the trust badge and two connector states, which a phone shows as the
 * strip's rows.
 */
const params = new URLSearchParams(location.search);
const state = params.get("state") ?? "saved";
const title =
  params.get("title") === "long"
    ? "Support reply for customers who wrote in about a late or missing order"
    : "Support reply";
const item = { key: "workflow/acme/support-reply", title };

const toasts = createToastStore();
const saving = new SaveState(toasts);
const announcer = createAnnouncer({ timers: systemTimers });
const badges = createBadgeRegistry();

if (params.get("badges") === "on") {
  badges.add({
    id: "workspace-trust",
    label: "Not trusted yet",
    tone: "neutral",
    priority: trustBadgePriority,
    action: "Review",
    onSelect: () => undefined,
  });
  badges.add({ id: "api-off", label: "Gmail API off", tone: "attention", priority: 10 });
  badges.add({
    id: "needs-sign-in",
    label: "Needs sign-in again",
    tone: "attention",
    priority: 10,
    action: "Fix",
    onSelect: () => undefined,
  });
}

if (state === "fields") {
  saving.setFieldsNotSaved(item, 2);
} else if (state === "items") {
  saving.holdForOutsideChange({ key: "agent/acme/sorter", title: "Sorter" }, () => undefined);
} else if (state === "failed") {
  void saving.save(item, () => Promise.reject(new Error("The disk is full.")));
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The save problem page needs its #root element (save-problem.html).");
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
      phoneTopBar={<div className="flex h-14 items-center border-b border-border px-4">Home</div>}
      badges={<HeaderBadges registry={badges} />}
      saveNote={<StatusBarSaveNote saving={saving} />}
      phoneBadges={<HeaderBadges registry={badges} layout="strip" />}
    >
      <h1 className="p-4">Support reply</h1>
    </ShellFrame>
  </StrictMode>,
);
