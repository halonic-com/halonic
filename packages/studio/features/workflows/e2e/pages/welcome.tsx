import { Welcome, type WelcomeRecentWorkspace } from "@halonicjs/studio-shell";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/**
 * The Welcome screen from made-up data (HAL-11985), as the shell's real `Welcome` draws it. The
 * `state` query parameter is `new` (no Recent), `recent` (five rows, one with a long folder) or
 * `failed` (as `recent`; pressing a row says its folder is gone, so the spec can show that line).
 */
const workspaces: readonly WelcomeRecentWorkspace[] = [
  { name: "Acme Support", location: "/work/Acme Support", sample: true },
  { name: "Renewals", location: "/work/Projects/Renewals" },
  {
    name: "Customer Support",
    location: "/work/Projects/Customer Support/Halonic Workspaces/Q3 Renewals",
  },
  { name: "Notes", location: "/work/Notes" },
  { name: "Website", location: "/work/Work/Website" },
];

const state = new URLSearchParams(location.search).get("state") ?? "new";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <div style={{ height: "100vh" }}>
      <Welcome
        onOpenFolder={async () => undefined}
        onNewWorkspace={() => {}}
        recent={
          state === "new"
            ? undefined
            : {
                workspaces,
                onOpen: async (folder) =>
                  state === "failed"
                    ? { folder, reason: "the folder is gone.", kind: "not_found" }
                    : undefined,
                onRemove: () => {},
              }
        }
      />
    </div>
  </StrictMode>,
);
