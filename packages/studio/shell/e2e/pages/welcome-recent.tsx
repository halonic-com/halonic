import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Welcome } from "../../src/welcome/welcome.tsx";

/**
 * The Welcome screen with Recent rows too long for a narrow window (`shell.welcome-recent`): a
 * POSIX folder and a Windows folder whose last names are each wider than the row at 320px, as at
 * 400% zoom, a name too long for one line, and a short row to compare with.
 */
const workspaces = [
  {
    name: "Benelux support",
    location: "/work/projects/customer-support-automation-for-the-benelux-region",
  },
  {
    name: "Benelux support on Windows",
    location: "D:\\Work\\Customer support automation for the Benelux region", // leak-guard: allow absolute-path made-up Windows path for the test
  },
  {
    name: "Customer support automation for the Benelux region and the rest of Europe",
    location: "~/Documents/Acme Support",
  },
  { name: "Acme", location: "~/Work/acme" },
];

function Page() {
  return (
    <Welcome
      onOpenFolder={async () => undefined}
      recent={{ workspaces, onOpen: async () => undefined, onRemove: () => {} }}
    />
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The Welcome page needs its #root element (welcome-recent.html).");
}
createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
