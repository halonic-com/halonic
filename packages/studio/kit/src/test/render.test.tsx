// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { click, render, unmountAll } from "./render.tsx";

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  );
}

afterEach(unmountAll);

describe("render", () => {
  it("puts the component in the document", () => {
    const { container } = render(<p>Hello</p>);
    expect(document.body.contains(container)).toBe(true);
    expect(container.innerHTML).toBe("<p>Hello</p>");
  });

  it("runs the state update a click starts before it returns", async () => {
    const { container } = render(<Counter />);
    const button = container.querySelector("button");
    expect(button?.textContent).toBe("Clicked 0 times");
    await click(button as HTMLButtonElement);
    expect(button?.textContent).toBe("Clicked 1 times");
  });

  it("renders again in the same container", () => {
    const { container, rerender } = render(<p>One</p>);
    rerender(<p>Two</p>);
    expect(container.textContent).toBe("Two");
  });
});
