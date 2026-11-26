// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { WelcomeRecent } from "./welcome-recent.tsx";

afterEach(unmountAll);

// How a Recent row lays out its name; e2e/welcome-recent.spec.ts checks the wrapping in a browser.
verifies("shell.welcome-recent", () => {
  it("shows a long name whole, wrapping, rather than cut with …", () => {
    const name = "Customer support automation for the Benelux region and the rest of Europe";
    const container = render(
      <WelcomeRecent
        workspaces={[{ name, location: "~/Documents/Acme Support" }]}
        opening={undefined}
        onOpen={() => {}}
        rowRef={() => null}
      />,
    );

    const nameLine = [...container.querySelectorAll("li button span")].find(
      (span) => span.textContent === name,
    );
    expect(nameLine?.className).not.toContain("truncate");
    expect(nameLine?.className).toContain("wrap-break-word");
  });

  it.each([
    ["engine", "Starting the engine…"],
    ["workspace", "Reading the workspace…"],
  ] as const)(
    "shows the opening row's %s step on the row and says it in the polite status",
    (step, text) => {
      const location = "~/Documents/Acme Support";
      const container = render(
        <WelcomeRecent
          workspaces={[{ name: "Acme Support", location }]}
          opening={{ location, step }}
          onOpen={() => {}}
          rowRef={() => null}
        />,
      );

      const shown = [...container.querySelectorAll("li button span")].find(
        (span) => span.textContent === text,
      );
      expect(shown?.closest(".sr-only")).toBeNull();
      // A screen reader hears the same step a sighted user sees (WCAG 4.1.3).
      expect(container.querySelector('[role="status"]')?.textContent).toBe(text);
    },
  );
});
