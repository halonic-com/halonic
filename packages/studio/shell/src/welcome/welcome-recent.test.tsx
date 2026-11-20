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
});
