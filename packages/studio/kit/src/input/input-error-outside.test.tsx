// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { Field } from "../field/field.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { Input } from "./input.tsx";

afterEach(() => {
  unmountAll();
});

/** An API key field whose refusal shows in a Callout next to it, not as the Field's error. */
function keyField(refused: boolean) {
  return (
    <>
      <Field label="API key" hint="Starts with sk-.">
        <Input mono invalid={refused} describedBy="key-refused" />
      </Field>
      {refused ? <div id="key-refused">That key was refused. Check it and try again.</div> : null}
    </>
  );
}

function textOf(container: HTMLElement): HTMLInputElement {
  return container.querySelector("input") as HTMLInputElement;
}

function boxOf(container: HTMLElement): string {
  return (textOf(container).parentElement as HTMLElement).className;
}

verifies("kit.input-error-outside", () => {
  it("marks the text invalid and draws the danger edge, without an error line of its own", () => {
    const { container } = render(keyField(true));
    const text = textOf(container);
    expect(text.getAttribute("aria-invalid")).toBe("true");
    expect(text.getAttribute("aria-describedby")?.split(" ")).toContain("key-refused");
    expect(boxOf(container)).toContain("border-danger");
    expect(boxOf(container)).toContain("focus-field-danger");
    // The Field still shows its hint: the error lives in the Callout, so no error line is drawn.
    expect(container.querySelector("p")?.textContent).toBe("Starts with sk-.");
  });

  it("goes back to the default look when the screen clears it", () => {
    const { container, rerender } = render(keyField(true));
    rerender(keyField(false));
    expect(textOf(container).hasAttribute("aria-invalid")).toBe(false);
    expect(boxOf(container)).not.toContain("border-danger");
    expect(boxOf(container)).toContain("border-border-control");
  });

  it("stays invalid while the Field shows an error, even when the screen says it isn't", () => {
    const { container } = render(
      <Field label="API key" error="Paste a key.">
        <Input invalid={false} />
      </Field>,
    );
    expect(textOf(container).getAttribute("aria-invalid")).toBe("true");
  });
});
