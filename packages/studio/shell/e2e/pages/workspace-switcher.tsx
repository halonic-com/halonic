import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SIDEBAR_DEFAULT_WIDTH } from "../../src/sidebar/sidebar-width.ts";
import { WorkspaceSwitcher } from "../../src/sidebar/workspace-switcher.tsx";

/**
 * The sidebar's workspace switcher in a sidebar of its starting width, with the sidebar's padding
 * (`StudioSidebar`), for long folders (`shell.welcome-recent`'s cut): a Windows folder under
 * OneDrive and a long POSIX one, each a switcher of its own. Whether an end fits on one line
 * depends on the font, and the runners have neither Inter nor Segoe UI: their fallback for the
 * kit's font stack may be a wide or monospace face. So the page sets Liberation Sans, which has
 * Arial's widths, close to Segoe UI's, and which Playwright's Linux packages install.
 */
const folders = [
  { name: "Acme", folder: "D:\\Sam Jansen\\OneDrive - Acme BV\\Documents\\Acme sample" }, // leak-guard: allow absolute-path made-up Windows path for the test
  { name: "Support", folder: "/work/projects/Customer Support/Halonic Workspaces/Q3 Renewals" },
];

function Page() {
  return (
    <div
      style={{ width: SIDEBAR_DEFAULT_WIDTH, fontFamily: '"Liberation Sans", Arial, sans-serif' }}
      className="flex flex-col gap-2 border-e p-2"
    >
      {folders.map((workspace) => (
        <WorkspaceSwitcher key={workspace.name} workspace={workspace} menu={[]} />
      ))}
    </div>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The switcher page needs its #root element (workspace-switcher.html).");
}
createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
