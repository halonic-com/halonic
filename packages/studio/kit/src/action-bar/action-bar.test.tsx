// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { Field } from "../field/field.tsx";
import { Input } from "../input/input.tsx";
import { TextArea } from "../input/text-area.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { ActionBar } from "./action-bar.tsx";

afterEach(() => {
  unmountAll();
});

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")];
}

const decisionRows = [
  [{ label: "Approve", variant: "primary" }],
  [{ label: "Ask for changes" }, { label: "Reject" }],
] as const;

verifies("kit.action-bar", () => {
  it("is the page's last row: a surface fill, a border on top, 12px 16px and the safe area", () => {
    const { container } = render(<ActionBar rows={[[{ label: "Try it" }]]} />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toContain("action-bar");
    expect(bar.className).toContain("border-t border-border bg-surface px-4 pt-3 pb-safe");
    expect(bar.className).not.toMatch(/\bfixed\b|\bh-\d/);
  });

  it("draws every button 48px and full width, the primary first, the rest secondary", () => {
    const { container } = render(<ActionBar rows={decisionRows} />);
    const [approve, ask, reject] = buttons(container) as [
      HTMLButtonElement,
      HTMLButtonElement,
      HTMLButtonElement,
    ];
    expect(approve.textContent).toBe("Approve");
    expect(approve.className).toContain("bg-primary");
    for (const button of [approve, ask, reject]) {
      expect(button.className).toContain("min-h-touch");
      expect(button.className).toContain("w-full");
      expect(button.getAttribute("type")).toBe("button");
    }
    expect(ask.className).toContain("border-border-strong bg-surface");
    expect(reject.className).not.toContain("bg-danger");
  });

  it("shares a row of two equally with 8px between, stacking when a label doesn't fit its half", () => {
    const { container } = render(<ActionBar rows={decisionRows} />);
    const rows = [...(container.firstElementChild as HTMLElement).children] as HTMLElement[];
    expect(rows).toHaveLength(2);
    const pair = rows[1] as HTMLElement;
    expect(pair.className).toContain("flex flex-wrap gap-2");
    for (const cell of pair.children) {
      expect(cell.className).toContain("min-w-fit flex-1 basis-[calc(50%-var(--spacing))]");
    }
    expect((container.firstElementChild as HTMLElement).className).toContain("flex-col gap-2");
  });

  it("shows a note above the buttons in its tone, whole", () => {
    const text = "Sending is off until you connect Gmail.";
    const { container } = render(
      <ActionBar
        note={{ text, tone: "warning" }}
        rows={[[{ label: "Approve", variant: "primary" }]]}
      />,
    );
    const note = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement;
    expect(note.tagName).toBe("P");
    expect(note.textContent).toBe(text);
    expect(note.className).toContain("text-small");
    expect(note.className).toContain("text-warning");
  });

  it("draws a lead row on top, then the note, then the buttons, all in the one bar", () => {
    const { container } = render(
      <ActionBar
        lead={<p>The assistant changed 3 things here</p>}
        note={{ text: "Sending is off until you connect Gmail.", tone: "warning" }}
        rows={[[{ label: "Accept all", variant: "primary" }]]}
      />,
    );
    expect(container.children).toHaveLength(1);
    const [lead, note, row] = [...(container.firstElementChild as HTMLElement).children];
    expect(lead?.textContent).toBe("The assistant changed 3 things here");
    expect(note?.textContent).toBe("Sending is off until you connect Gmail.");
    expect(row?.querySelector("button")?.textContent).toBe("Accept all");
  });

  it("draws nothing extra without a lead", () => {
    const { container } = render(<ActionBar rows={[[{ label: "Try it" }]]} />);
    expect((container.firstElementChild as HTMLElement).children).toHaveLength(1);
  });

  it.each([null, false, true, ""])("draws nothing extra for an empty lead (%j)", (lead) => {
    const { container } = render(<ActionBar lead={lead} rows={[[{ label: "Try it" }]]} />);
    expect((container.firstElementChild as HTMLElement).children).toHaveLength(1);
  });

  it("calls a button's onClick", async () => {
    const onReject = vi.fn();
    const { container } = render(
      <ActionBar rows={[[{ label: "Ask for changes" }, { label: "Reject", onClick: onReject }]]} />,
    );
    await click(buttons(container)[1] as HTMLButtonElement);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("while one button is busy, makes the others unavailable with its label as the reason", async () => {
    const onAsk = vi.fn();
    const { container } = render(
      <ActionBar
        rows={[
          [{ label: "Approve", variant: "primary", busy: true, busyLabel: "Approving…" }],
          [{ label: "Ask for changes", onClick: onAsk }, { label: "Reject" }],
        ]}
      />,
    );
    const [approve, ask, reject] = buttons(container) as [
      HTMLButtonElement,
      HTMLButtonElement,
      HTMLButtonElement,
    ];
    expect(approve.getAttribute("aria-busy")).toBe("true");
    expect(approve.hasAttribute("aria-disabled")).toBe(false);
    for (const other of [ask, reject]) {
      expect(other.getAttribute("aria-disabled")).toBe("true");
      expect(other.getAttribute("aria-describedby")).toBe(approve.id);
    }
    await click(ask);
    expect(onAsk).not.toHaveBeenCalled();
  });

  it("gives the busy button's id to it alone, so two busy buttons never share one", () => {
    const { container } = render(
      <ActionBar
        rows={[
          [
            { label: "Approve", busy: true },
            { label: "Reject", busy: true },
          ],
        ]}
      />,
    );
    const [approve, reject] = buttons(container) as [HTMLButtonElement, HTMLButtonElement];
    expect(approve.id).not.toBe("");
    expect(reject.id).not.toBe(approve.id);
  });

  it("takes a button's own id, kept while it's busy, and an unavailable reason", async () => {
    const onCreate = vi.fn();
    const { container, rerender } = render(
      <ActionBar
        rows={[
          [{ id: "create", label: "Create", unavailable: { reason: "why" }, onClick: onCreate }],
        ]}
      />,
    );
    const create = buttons(container)[0] as HTMLButtonElement;
    expect(create.id).toBe("create");
    expect(create.getAttribute("aria-disabled")).toBe("true");
    expect(create.getAttribute("aria-describedby")).toBe("why");
    await click(create);
    expect(onCreate).not.toHaveBeenCalled();
    rerender(<ActionBar rows={[[{ id: "create", label: "Create", busy: true }]]} />);
    expect((buttons(container)[0] as HTMLButtonElement).id).toBe("create");
  });

  it("rides the keyboard by default and marks a bar that steps aside while you type", () => {
    const ride = render(<ActionBar rows={[[{ label: "Create", variant: "primary" }]]} />);
    expect(
      (ride.container.firstElementChild as HTMLElement).getAttribute("data-while-typing"),
    ).toBe("ride");
    const hide = render(<ActionBar whileTyping="hide" rows={[[{ label: "Run now" }]]} />);
    expect(
      (hide.container.firstElementChild as HTMLElement).getAttribute("data-while-typing"),
    ).toBe("hide");
  });

  it("refuses a second primary, or a primary that isn't first", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <ActionBar rows={[[{ label: "Try it" }, { label: "Approve", variant: "primary" }]]} />,
      ),
    ).toThrow("at most one primary");
    expect(() =>
      render(
        <ActionBar
          rows={[
            [{ label: "Approve", variant: "primary" }],
            [{ label: "Accept all", variant: "primary" }],
          ]}
        />,
      ),
    ).toThrow("at most one primary");
    quiet.mockRestore();
  });

  it("draws a danger decision first, and counts it as the one decision", () => {
    const { container } = render(
      <ActionBar rows={[[{ label: "Delete agent", variant: "danger" }, { label: "Keep it" }]]} />,
    );
    const [remove, keep] = [...container.querySelectorAll("button")];
    expect(remove?.className).toContain("bg-danger");
    expect(keep?.className).toContain("bg-surface");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <ActionBar rows={[[{ label: "Keep it" }, { label: "Delete agent", variant: "danger" }]]} />,
      ),
    ).toThrow("at most one primary or danger");
    expect(() =>
      render(
        <ActionBar
          rows={[
            [{ label: "Delete agent", variant: "danger" }],
            [{ label: "Approve", variant: "primary" }],
          ]}
        />,
      ),
    ).toThrow("at most one primary or danger");
    quiet.mockRestore();
  });

  it("is hidden only by the kit's text fields, which carry data-text-entry", () => {
    const { container } = render(
      <>
        <Field label="Name">
          <Input />
        </Field>
        <Field label="Notes">
          <TextArea />
        </Field>
      </>,
    );
    expect(container.querySelector("input")?.hasAttribute("data-text-entry")).toBe(true);
    expect(container.querySelector("textarea")?.hasAttribute("data-text-entry")).toBe(true);
  });
});
