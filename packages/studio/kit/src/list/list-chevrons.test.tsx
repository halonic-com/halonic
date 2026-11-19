// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { StatusChip } from "../status-chip/status-chip.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";

afterEach(() => {
  unmountAll();
});

const version = {
  id: "v2",
  title: "Version 2",
  meta: "You · 09:12",
  trailing: <StatusChip tone="neutral">Not shared yet</StatusChip>,
};

function versions(presentation: "phone" | "desktop"): HTMLElement {
  const { container } = render(
    <PresentationProvider presentation={presentation}>
      <List label="History" rows={[version]} chevrons onOpen={() => undefined} />
    </PresentationProvider>,
  );
  return container;
}

/** The meta line's text, with the chip when it starts the line. */
function metaLineOf(container: HTMLElement): HTMLElement {
  const meta = Array.from(container.querySelectorAll<HTMLElement>("span")).find(
    (span) => span.textContent === "You · 09:12",
  );
  if (meta === undefined) {
    throw new Error("No meta line");
  }
  return meta;
}

verifies("kit.list-chevrons", () => {
  it("on a phone ends each row in a chevron hidden from screen readers", () => {
    const container = versions("phone");
    const chevron = container.querySelector('[data-part="row-chevron"]');
    expect(chevron).not.toBeNull();
    expect(chevron?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(chevron?.className).toContain("text-fg-subtle");
  });

  it("on a phone starts the meta line with the trailing chip", () => {
    const container = versions("phone");
    // The chip and the text share one line under the title, the chip first.
    const line = metaLineOf(container).parentElement;
    expect(line?.textContent).toBe("Not shared yetYou · 09:12");
  });

  it("on desktop draws no chevron and keeps the chip on the right", () => {
    const container = versions("desktop");
    expect(container.querySelector('[data-part="row-chevron"]')).toBeNull();
    // The meta line holds only its text; the chip is the row's last part.
    expect(metaLineOf(container).parentElement?.textContent).toBe("Version 2You · 09:12");
    expect(container.textContent).toContain("Not shared yet");
  });
});
