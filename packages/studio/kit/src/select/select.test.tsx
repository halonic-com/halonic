// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Field } from "../field/field.tsx";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { buttonNamed, dialogOf, fakeDialogPage, restoreDialogPage } from "../test/dialogs.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { Select, type SelectOption } from "./select.tsx";

beforeEach(() => {
  fakeDialogPage();
});

afterEach(() => {
  unmountAll();
  restoreDialogPage();
  vi.restoreAllMocks();
});

const models: readonly SelectOption[] = [
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
  { value: "opus", label: "Opus", disabled: true },
];

const ignore = () => undefined;

/** The box round the control: the element that carries the field's look. */
function boxOf(element: Element): string {
  return (element.parentElement as HTMLElement).className;
}

/** Picks a value in a native select, the way the browser reports it. */
function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** The words an `aria-labelledby` list points at, joined the way a screen reader reads them. */
function nameOf(element: Element): string {
  const ids = (element.getAttribute("aria-labelledby") ?? "").split(" ");
  return ids.map((id) => document.getElementById(id)?.textContent?.trim()).join(", ");
}

/** The picker sheet's radio for an option, found by its words. */
function radioNamed(sheet: HTMLElement, name: string): HTMLInputElement {
  const radio = [...sheet.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
    (candidate) => nameOf(candidate) === name,
  );
  if (radio === undefined) {
    throw new Error(`No radio named ${name}`);
  }
  return radio;
}

function onPhone(select: ReactNode) {
  return render(<PresentationProvider presentation="phone">{select}</PresentationProvider>);
}

verifies("kit.select", () => {
  it("is a native select on desktop, in the Input's box with a chevron and room for it", () => {
    const { container } = render(
      <Select aria-label="Model" options={models} value="sonnet" onChange={ignore} />,
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("sonnet");
    expect(select.getAttribute("aria-label")).toBe("Model");
    expect(select.className).toContain("appearance-none");
    expect(select.className).toContain("pe-8");
    expect(boxOf(select)).toContain("border-border-control bg-surface hover:border-fg-muted");
    expect(boxOf(select)).toContain("focus-field");
    expect(boxOf(select)).toContain("min-h-control-md");
    const chevron = select.nextElementSibling as HTMLElement;
    expect(chevron.getAttribute("aria-hidden")).toBe("true");
    expect(chevron.className).toContain("text-fg-muted");
    expect(chevron.className).toContain("pointer-events-none");
    expect(chevron.className).toContain("size-icon-sm");
  });

  it("calls onChange with the value the user picks", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Select aria-label="Model" options={models} value="sonnet" onChange={onChange} />,
    );
    choose(container.querySelector("select") as HTMLSelectElement, "haiku");
    expect(onChange).toHaveBeenCalledWith("haiku");
  });

  it("keeps an unavailable option in the list, greyed and not pickable", () => {
    const { container } = render(
      <Select aria-label="Model" options={models} value="sonnet" onChange={ignore} />,
    );
    const opus = container.querySelector('option[value="opus"]') as HTMLOptionElement;
    expect(opus.disabled).toBe(true);
    expect(opus.textContent).toBe("Opus");
  });

  it("is 28px at sm, and 48px with 16px text on a phone or 16px under a touch pointer", () => {
    const { container } = render(
      <Select aria-label="Model" size="sm" options={models} value="sonnet" onChange={ignore} />,
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(boxOf(select)).toContain("min-h-control-sm");
    expect(boxOf(select)).toContain("phone:min-h-touch");
    expect(boxOf(select)).toContain("touch:not-phone:min-h-control-lg");
    expect(select.className).toContain("phone:text-input-touch");
    expect(select.className).toContain("touch:text-input-touch");
  });

  it("takes its id, description and required from its Field", () => {
    const { container } = render(
      <Field label="Model" hint="Used by new agents" required>
        <Select options={models} value="sonnet" onChange={ignore} />
      </Field>,
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    const label = container.querySelector("label") as HTMLLabelElement;
    expect(label.htmlFor).toBe(select.id);
    const line = document.getElementById(select.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toBe("Used by new agents");
    expect(select.getAttribute("aria-required")).toBe("true");
    expect(select.hasAttribute("aria-invalid")).toBe(false);
  });

  it("shows the placeholder for a value that no longer exists, with the danger edge", () => {
    const { container } = render(
      <Field label="Model" error="smart no longer exists. Choose another model.">
        <Select options={models} value="smart" onChange={ignore} placeholder="Choose a model" />
      </Field>,
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    const shown = select.selectedOptions[0] as HTMLOptionElement;
    expect(shown.textContent).toBe("Choose a model");
    expect(shown.disabled).toBe(true);
    expect(select.className).toContain("text-fg-subtle");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(boxOf(select)).toContain("border-danger");
    expect(boxOf(select)).toContain("focus-field-danger");
    expect(boxOf(select)).not.toContain("hover:");
  });

  it("has no placeholder option while the value is in the list", () => {
    const { container } = render(
      <Select
        aria-label="Model"
        options={models}
        value="haiku"
        onChange={ignore}
        placeholder="Choose a model"
      />,
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.options).toHaveLength(models.length);
    expect(select.className).toContain("text-fg");
    expect(select.className).not.toContain("text-fg-subtle");
  });

  it("is disabled with the disabled colours, the not-allowed cursor and no focus look", () => {
    const { container } = render(
      <Select aria-label="Model" options={models} value="sonnet" onChange={ignore} disabled />,
    );
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.className).toContain("disabled:cursor-not-allowed");
    expect(boxOf(select)).toContain("border-border bg-surface-subtle text-fg-disabled");
    expect(boxOf(select)).not.toContain("focus-field");
  });

  it("gives its ref the select on desktop and the button on a phone", () => {
    let desktop: HTMLElement | null = null;
    render(
      <Select
        aria-label="Model"
        options={models}
        value="sonnet"
        onChange={ignore}
        ref={(node) => {
          desktop = node;
        }}
      />,
    );
    expect((desktop as HTMLElement | null)?.tagName).toBe("SELECT");
    let phone: HTMLElement | null = null;
    onPhone(
      <Select
        aria-label="Model"
        options={models}
        value="sonnet"
        onChange={ignore}
        ref={(node) => {
          phone = node;
        }}
      />,
    );
    expect((phone as HTMLElement | null)?.tagName).toBe("BUTTON");
  });

  it("is a picker button on a phone, named by the label and the value", () => {
    const { container } = onPhone(
      <Field label="Model" hint="Used by new agents">
        <Select options={models} value="sonnet" onChange={ignore} />
      </Field>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(nameOf(button)).toBe("Model, Sonnet");
    const label = container.querySelector("label") as HTMLLabelElement;
    expect(label.htmlFor).toBe(button.id);
    const line = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toBe("Used by new agents");
    expect(boxOf(button)).toContain("phone:min-h-touch");
    expect(button.className).toContain("phone:text-input-touch");
    // 20px, like the folded LongText's chevron.
    const chevron = button.parentElement?.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(chevron.className).toContain("size-icon-md");
  });

  it("renders only the button on a phone, with a hidden input for a form that posts", () => {
    const { container } = onPhone(
      <Field label="Model">
        <Select name="model" options={models} value="sonnet" onChange={ignore} />
      </Field>,
    );
    expect(container.querySelector("select")).toBeNull();
    const posted = container.querySelector('input[type="hidden"]') as HTMLInputElement;
    expect(posted.name).toBe("model");
    expect(posted.value).toBe("sonnet");
  });

  it("doesn't post its hidden input while unavailable on a phone, like a disabled select", () => {
    const { container } = onPhone(
      <Field label="Model">
        <Select name="model" options={models} value="sonnet" disabled onChange={ignore} />
      </Field>,
    );
    expect((container.querySelector('input[type="hidden"]') as HTMLInputElement).disabled).toBe(
      true,
    );
  });

  it("is named by its aria-label and the value outside a Field on a phone", () => {
    const { container } = onPhone(
      <Select aria-label="Model" options={models} value="haiku" onChange={ignore} />,
    );
    expect(nameOf(container.querySelector("button") as HTMLButtonElement)).toBe("Model, Haiku");
  });

  it("opens the picker sheet titled with the label on a phone, and saves what the user picks", async () => {
    const onChange = vi.fn();
    const { container } = onPhone(
      <Field label="Model">
        <Select options={models} value="sonnet" onChange={onChange} />
      </Field>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    button.focus();
    await click(button);
    const sheet = dialogOf(container);
    expect(sheet.querySelector("h2")?.textContent).toBe("Model");
    expect(radioNamed(sheet, "Sonnet").checked).toBe(true);
    await click(radioNamed(sheet, "Haiku"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("haiku");
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("keeps the value when the sheet's Close is pressed, and focus goes back to the button", async () => {
    const onChange = vi.fn();
    const { container } = onPhone(
      <Select aria-label="Model" options={models} value="sonnet" onChange={onChange} />,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    button.focus();
    await click(button);
    expect(dialogOf(container).querySelector("h2")?.textContent).toBe("Model");
    await click(buttonNamed(dialogOf(container), "Close"));
    expect(container.querySelector("dialog")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });

  it("lists an unavailable option in the sheet without a second line, and it can't be picked", async () => {
    const onChange = vi.fn();
    const { container } = onPhone(
      <Select aria-label="Model" options={models} value="sonnet" onChange={onChange} />,
    );
    await click(container.querySelector("button") as HTMLButtonElement);
    const opus = radioNamed(dialogOf(container), "Opus");
    expect(opus.disabled).toBe(true);
    expect(opus.hasAttribute("aria-describedby")).toBe(false);
    await click(opus);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the placeholder and the error on the phone button", () => {
    const { container } = onPhone(
      <Field label="Model" error="smart no longer exists. Choose another model.">
        <Select options={models} value="smart" onChange={ignore} placeholder="Choose a model" />
      </Field>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(nameOf(button)).toBe("Model, Choose a model");
    expect(button.querySelector("span")?.className).toContain("text-fg-subtle");
    // A button can't be aria-invalid; the error reaches screen readers as its description.
    expect(button.hasAttribute("aria-invalid")).toBe(false);
    const line = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toContain("smart no longer exists.");
    expect(boxOf(button)).toContain("border-danger");
  });

  it("is a disabled button on a phone", () => {
    const { container } = onPhone(
      <Select aria-label="Model" options={models} value="sonnet" onChange={ignore} disabled />,
    );
    expect((container.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
