import { PresentationProvider } from "@halonicjs/studio-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OverviewPage, type OverviewWords } from "../../src/overview/overview-page.tsx";

/**
 * The overview page on a phone, with skills whose line under the name holds a detail and a used-by
 * text, and a ⋮ on each row as in the Library. Whether the used-by text stays whole and where the
 * detail goes depend on the row's real width, which only a real browser has (HAL-13648).
 */
const words: OverviewWords = {
  searchLabel: "Search for skills",
  loadingLabel: "Loading skills",
  chipsLabel: "Hub",
  allChip: "All",
  sharedChip: (workspace) => `Shared in ${workspace}`,
  moreLabel: (name) => `More actions for ${name}`,
  sharedSection: (workspace) => `Shared in ${workspace}`,
  emptySection: (name) => `No skills in ${name} yet`,
  noMatch: (query) => `No skills match "${query}".`,
  shownCount: (count) => (count === 1 ? "1 skill." : `${count} skills.`),
  nothingYet: { title: "No skills yet" },
};

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The overview phone row page needs its #root element (overview-phone-row.html).");
}
createRoot(root).render(
  <StrictMode>
    <PresentationProvider presentation="phone">
      <OverviewPage
        hubs={[
          {
            id: "acme",
            name: "acme",
            items: [
              {
                id: "refunds",
                name: "Refund handling",
                detail: "When an email asks for a refund",
                usedBy: "Not used yet",
              },
              {
                id: "tone",
                name: "Tone of voice",
                detail: "Friendly",
                usedBy: "Used by Writer",
              },
              {
                id: "shop-name",
                name: "Shop name",
                detail: "Adds the shop's name",
                usedBy: "Used by Sales",
              },
              {
                id: "welcome",
                name: "Welcome email",
                detail: "Draft",
                usedBy: "Used by Writer",
              },
            ],
          },
        ]}
        words={words}
        onOpen={() => undefined}
        onOpenInNewTab={() => undefined}
        itemMenu={() => [{ id: "open", label: "Open", onSelect: () => undefined }]}
      />
    </PresentationProvider>
  </StrictMode>,
);
