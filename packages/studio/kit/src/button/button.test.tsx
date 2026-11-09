// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { Button, type ButtonProps } from "./button.tsx";

afterEach(() => {
  unmountAll();
});

function renderButton(props: ButtonProps) {
  const { container } = render(<Button {...props} />);
  return container.querySelector("button") as HTMLButtonElement;
}

const closeIcon = <svg data-testid="close-icon" />;

verifies("kit.button", () => {
  it("is a native button of type button, secondary and md by default", () => {
    const button = renderButton({ children: "New agent" });
    expect(button.type).toBe("button");
    expect(button.textContent).toBe("New agent");
    expect(button.className).toContain("border-border-strong");
    expect(button.className).toContain("min-h-control-md");
  });

  it("submits a form only when it says so", () => {
    expect(renderButton({ children: "Create", type: "submit" }).type).toBe("submit");
  });

  it.each([
    ["primary", "bg-primary text-on-primary", "hover:bg-primary-hover"],
    ["secondary", "bg-surface text-fg", "hover:bg-surface-subtle"],
    ["ghost", "text-fg-muted", "hover:bg-surface-muted"],
    ["danger", "bg-danger text-on-danger", "hover:bg-danger-hover"],
  ] as const)(
    "draws the %s variant from tokens, with the hover fill on press too",
    (variant, look, hover) => {
      const { className } = renderButton({ variant, children: "Save" });
      expect(className).toContain(look);
      expect(className).toContain(`not-aria-disabled:${hover}`);
      const pressed = hover.replace("hover:", "active:");
      expect(className).toContain(`not-aria-disabled:${pressed}`);
    },
  );

  it.each([
    ["sm", "min-h-control-sm px-2.5"],
    ["md", "min-h-control-md px-3"],
    ["lg", "min-h-control-lg px-4"],
  ] as const)("is %s high, with a 48px hit area on a phone and a touch screen", (size, look) => {
    const { className } = renderButton({ size, children: "Save" });
    expect(className).toContain(look);
    expect(className).toContain("phone:hit-touch");
    expect(className).toContain("touch:hit-touch");
  });

  it("renders sm and md at lg on a phone and a touch screen", () => {
    for (const size of ["sm", "md"] as const) {
      const { className } = renderButton({ size, children: "Save" });
      expect(className).toContain("phone:min-h-control-lg");
      expect(className).toContain("touch:min-h-control-lg");
    }
  });

  it("lets a touch button's label wrap, full width when it's a block", () => {
    const { className } = renderButton({ size: "touch", block: true, children: "Approve" });
    expect(className).toContain("min-h-touch");
    expect(className).toContain("w-full");
    expect(className).not.toContain("whitespace-nowrap");
  });

  it("shows the keyboard focus ring", () => {
    expect(renderButton({ children: "Save" }).className).toContain("focus-ring");
  });

  it("puts a 16px icon before the label, hidden from screen readers", () => {
    const button = renderButton({ icon: closeIcon, children: "Close" });
    const slot = button.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(slot.className).toContain("size-icon-sm");
    expect(slot.querySelector('[data-testid="close-icon"]')).not.toBeNull();
    expect(button.lastChild?.textContent).toBe("Close");
  });

  it("is a square icon button named by its label", () => {
    const button = renderButton({ icon: closeIcon, label: "Close Support reply", size: "sm" });
    expect(button.getAttribute("aria-label")).toBe("Close Support reply");
    expect(button.className).toContain("size-control-sm");
    expect(button.className).toContain("phone:size-touch");
    expect(button.querySelector('[aria-hidden="true"]')?.className).toContain("phone:size-icon-md");
  });

  it("calls onClick", async () => {
    const onClick = vi.fn();
    await click(renderButton({ onClick, children: "Save" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("leaves the Tab order with tabIndex -1 inside a grid, and reports focus", () => {
    const onFocus = vi.fn();
    const button = renderButton({
      icon: closeIcon,
      label: "More actions for Sorter",
      tabIndex: -1,
      onFocus,
    });
    expect(button.tabIndex).toBe(-1);
    button.focus();
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it("can't take a label and children together, and an icon button must have a name", () => {
    // @ts-expect-error An icon button has a label instead of children.
    const both = <Button icon={closeIcon} label="Close" children="Close" />;
    // @ts-expect-error An icon button without children needs a label.
    const unnamed = <Button icon={closeIcon} />;
    // @ts-expect-error There's no disabled prop: use unavailable with a reason.
    const disabled = <Button disabled>Save</Button>;
    expect([both, unnamed, disabled]).toHaveLength(3);
  });
});

verifies("kit.button-unavailable", () => {
  function renderUnavailable(onClick: () => void) {
    const { container } = render(
      <>
        <Button unavailable={{ reason: "updates-reason" }} onClick={onClick}>
          Make a version
        </Button>
        <p id="updates-reason">Finish getting updates first.</p>
      </>,
    );
    return container.querySelector("button") as HTMLButtonElement;
  }

  it("stays focusable and in the Tab order, says why, and ignores clicks", async () => {
    const onClick = vi.fn();
    const button = renderUnavailable(onClick);

    expect(button.disabled).toBe(false);
    expect(button.tabIndex).toBe(0);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-describedby")).toBe("updates-reason");
    button.focus();
    expect(document.activeElement).toBe(button);

    await click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("looks unavailable at 45%, with no hover change", () => {
    const { className } = renderUnavailable(() => {});
    expect(className).toContain("aria-disabled:opacity-45");
    expect(className).toContain("aria-disabled:cursor-not-allowed");
  });

  it("doesn't submit its form", async () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    const { container } = render(
      <form>
        <Button type="submit" unavailable={{ reason: "why" }}>
          Create
        </Button>
        <p id="why">Fill in the name first.</p>
      </form>,
    );
    container.querySelector("form")?.addEventListener("submit", onSubmit);
    await click(container.querySelector("button") as HTMLButtonElement);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("while busy, shows the spinner in place of the icon, says aria-busy and ignores clicks", async () => {
    const onClick = vi.fn();
    const button = renderButton({ busy: true, icon: closeIcon, onClick, children: "Creating…" });

    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(false);
    expect(button.querySelector('[data-testid="close-icon"]')).toBeNull();
    expect(button.querySelector("svg.animate-spin")).not.toBeNull();
    expect(button.textContent).toBe("Creating…");

    await click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("while busy, doesn't submit its form and keeps aria-busy and focus", async () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    const { container } = render(
      <form>
        <Button type="submit" busy>
          Create
        </Button>
      </form>,
    );
    container.querySelector("form")?.addEventListener("submit", onSubmit);
    const button = container.querySelector("button") as HTMLButtonElement;
    button.focus();

    await click(button);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(button);
  });

  it("keeps focus while it turns busy and back", () => {
    const { container, rerender } = render(<Button>Create</Button>);
    const button = container.querySelector("button") as HTMLButtonElement;
    button.focus();
    rerender(<Button busy>Create</Button>);
    rerender(<Button>Create</Button>);
    expect(document.activeElement).toBe(button);
    expect(button.hasAttribute("aria-busy")).toBe(false);
  });
});
