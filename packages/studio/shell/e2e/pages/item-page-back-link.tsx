import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ItemPage } from "../../src/item-page/item-page.tsx";
import { BackLinkSlotProvider } from "../../src/page/back-link-slot.tsx";

/**
 * An item page with a chat under a back link (`shell.page-back-link`), in a 600px tab that is its
 * own scroller as the window's tab pages are, for the height the link adds. The page has a chat
 * unless the `chat` query parameter is `none`.
 */
function Page() {
  const withChat = new URLSearchParams(location.search).get("chat") !== "none";
  return (
    <div data-tab-page="" className="h-[600px] overflow-y-auto">
      <BackLinkSlotProvider
        value={
          <nav aria-label="Back" className="px-4 pt-3">
            <a href="#workflows" className="text-small">
              Workflows
            </a>
          </nav>
        }
      >
        <ItemPage
          icon={<svg viewBox="0 0 16 16" />}
          kind="Workflow"
          name="Support reply"
          onRename={() => undefined}
          views={[{ id: "flow", label: "Flow" }]}
          chat={
            withChat
              ? { startsOpen: true, render: () => <textarea aria-label="Message" /> }
              : undefined
          }
        >
          {() => <p>Flow</p>}
        </ItemPage>
      </BackLinkSlotProvider>
    </div>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The back link page needs its #root element (item-page-back-link.html).");
}
createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
