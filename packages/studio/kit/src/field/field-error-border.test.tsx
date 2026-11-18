// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { Input } from "../input/input.tsx";
import { TextArea } from "../input/text-area.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Field } from "./field.tsx";

afterEach(() => {
  unmountAll();
});

const boxOf = (container: HTMLElement, selector: string) =>
  ((container.querySelector(selector) as Element).parentElement as HTMLElement).className;

function code(error: string | null) {
  return (
    <Field label="Code" error={error}>
      <Input defaultValue="7KQ2 M4XD 9TH8" />
    </Field>
  );
}

verifies("kit.field-error-border", () => {
  it("gives the control a danger edge while the Field shows an error, and takes it away after", () => {
    const { container, rerender } = render(code("That code doesn't match. 4 tries left."));
    expect(boxOf(container, "input")).toContain("border-danger");
    expect(boxOf(container, "input")).toContain("focus-field-danger");
    expect(container.querySelector("p")?.textContent).toBe(
      "That code doesn't match. 4 tries left.",
    );
    rerender(code(null));
    expect(boxOf(container, "input")).not.toContain("border-danger");
    expect(boxOf(container, "input")).toContain("border-border-control");
  });

  it("does the same for a TextArea", () => {
    const { container } = render(
      <Field label="Instructions" error="Keep it under 4,000 characters">
        <TextArea defaultValue="Answer customer mail." />
      </Field>,
    );
    expect(boxOf(container, "textarea")).toContain("border-danger");
  });
});
