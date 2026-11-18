// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { CodeDisplay } from "./code-display.tsx";

afterEach(() => {
  unmountAll();
});

const shownIn = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[aria-hidden="true"]')).map(
    (part) => part.textContent,
  );

verifies("kit.code-display", () => {
  it("shows the check code in two groups with a dot, named one character at a time", () => {
    const { container } = render(<CodeDisplay code="4F72KQ" group={3} />);
    const code = container.firstElementChild as HTMLElement;
    expect(code.getAttribute("role")).toBe("img");
    expect(code.getAttribute("aria-label")).toBe("4, F, 7, 2, K, Q");
    expect(shownIn(container)).toEqual(["4F7", "", "2KQ"]);
    expect(code.className).toContain("font-mono font-semibold");
    expect(code.className).toContain("rounded-md border border-border-strong bg-surface-subtle");
    expect(code.className).toContain("text-display");
  });

  it("names a typed code after its label, and draws md without a box", () => {
    const { container } = render(
      <CodeDisplay code="7KQ2M4XD9TH6" group={4} size="md" label="Pairing code" />,
    );
    const code = container.firstElementChild as HTMLElement;
    expect(code.getAttribute("aria-label")).toBe(
      "Pairing code: 7, K, Q, 2, M, 4, X, D, 9, T, H, 6",
    );
    expect(shownIn(container)).toEqual(["7KQ2", "", "M4XD", "", "9TH6"]);
    expect(code.className).toContain("text-title");
    expect(code.className).not.toContain("border");
  });
});
