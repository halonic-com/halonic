// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { OverviewPage, type OverviewWords } from "./overview-page.tsx";

afterEach(() => {
  unmountAll();
});

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

verifies("shell.overview.used-by", () => {
  it("gives the used-by text a line of its own on a phone when the item asks for it", () => {
    const page = render(
      <PresentationProvider presentation="phone">
        <OverviewPage
          hubs={[
            {
              id: "acme",
              name: "acme",
              items: [
                {
                  id: "reply",
                  name: "Support reply",
                  detail: "A customer writes in and gets a drafted reply",
                  usedBy: "Last run ✕ Today 03:17",
                  usedByOwnLine: true,
                },
              ],
            },
          ]}
          words={words}
          onOpen={() => undefined}
          onOpenInNewTab={() => undefined}
        />
      </PresentationProvider>,
    );
    const row = [...page.querySelectorAll("tr")].find((each) =>
      each.textContent?.includes("Support reply"),
    );
    const lines = [...(row?.querySelectorAll("span.block") ?? [])].map((each) => each.textContent);
    expect(lines).toEqual([
      "A customer writes in and gets a drafted reply",
      "Last run ✕ Today 03:17",
    ]);
    expect(row?.textContent).not.toContain(" · ");
  });
});
