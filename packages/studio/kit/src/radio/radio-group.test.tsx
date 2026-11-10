// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Field } from "../field/field.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { RadioGroup, type RadioOption } from "./radio-group.tsx";

afterEach(() => {
  unmountAll();
});

type Way = "address" | "command" | "docker";

const ways: readonly RadioOption<Way>[] = [
  { value: "address", label: "Web address", field: <input aria-label="Address" /> },
  {
    value: "command",
    label: "Local command",
    note: "Runs a program on this computer.",
    field: <input aria-label="Command" />,
  },
  { value: "docker", label: "Docker image", note: "Needs Docker.", unavailable: true },
];

function radiosIn(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
}

function groupIn(container: HTMLElement): HTMLElement {
  return container.querySelector('[role="radiogroup"]') as HTMLElement;
}

verifies("kit.radio", () => {
  it("is a radiogroup named by its Field's label, of native radios that share one name", () => {
    const { container } = render(
      <Field label="Connect with" hint="You can change it later.">
        <RadioGroup options={ways} value="address" onChange={vi.fn()} />
      </Field>,
    );
    const group = groupIn(container);
    const name = document.getElementById(group.getAttribute("aria-labelledby") ?? "");
    expect(name?.textContent).toBe("Connect with");
    expect(name?.tagName).toBe("LABEL");
    const line = document.getElementById(group.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toBe("You can change it later.");
    const radios = radiosIn(container);
    expect(radios).toHaveLength(3);
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    expect(radios[0]?.checked).toBe(true);
    expect(radios[0]?.labels?.[0]?.textContent).toBe("Web address");
  });

  it("takes its own label outside a Field", () => {
    const { container } = render(
      <RadioGroup label="Look things up" options={ways} value={null} onChange={vi.fn()} />,
    );
    expect(groupIn(container).getAttribute("aria-label")).toBe("Look things up");
    expect(groupIn(container).hasAttribute("aria-labelledby")).toBe(false);
  });

  it("draws a 16px circle with a control edge, and a 5px primary ring when picked", () => {
    const { container } = render(
      <RadioGroup label="Connect with" options={ways} value="address" onChange={vi.fn()} />,
    );
    const [picked] = radiosIn(container);
    expect(picked?.className).toContain("size-4");
    expect(picked?.className).toContain("rounded-full");
    expect(picked?.className).toContain("appearance-none");
    expect(picked?.className).toContain("border-border-control");
    expect(picked?.className).toContain("bg-surface");
    expect(picked?.className).toContain("mt-0.5");
    // A phone's label lines are 24px high, so the 16px circle sits 4px down there.
    expect(picked?.className).toContain("phone:mt-1");
    expect(picked?.className).toContain(
      "checked:border-5 checked:border-primary checked:bg-on-primary",
    );
    expect(picked?.className).toContain("focus-ring");
    expect(picked?.className).toContain("radio-forced");
  });

  it("turns an empty edge fg-muted and a ring primary-hover under the pointer, over the circle or its label", () => {
    const { container } = render(
      <RadioGroup label="Connect with" options={ways} value="address" onChange={vi.fn()} />,
    );
    const [first] = radiosIn(container);
    expect(first?.className).toContain("hover:border-fg-muted group-hover/radio:border-fg-muted");
    expect(first?.className).toContain("checked:hover:border-primary-hover");
    expect(first?.labels?.[0]?.className).toContain("group/radio");
  });

  it("calls onChange with the value the user picks, by its label or by the arrow keys", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <RadioGroup label="Connect with" options={ways} value="address" onChange={onChange} />,
    );
    const [, command] = radiosIn(container);
    await click(command?.labels?.[0] as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith("command");
    // jsdom doesn't move the choice on an arrow key; the browser does, by checking the next
    // radio of the same name, which arrives here as a change on that radio.
    await click(command as HTMLInputElement);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("lists an unavailable option, skipped by the arrow keys and described by its note at full strength", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <RadioGroup label="Connect with" options={ways} value="address" onChange={onChange} />,
    );
    const docker = radiosIn(container)[2] as HTMLInputElement;
    // Native disabled is what makes the browser's arrow keys skip it (component specs 19.1).
    expect(docker.disabled).toBe(true);
    const note = document.getElementById(docker.getAttribute("aria-describedby") ?? "");
    expect(note?.textContent).toBe("Needs Docker.");
    // Named by its words alone, so the note is read once, as its description.
    const name = document.getElementById(docker.getAttribute("aria-labelledby") ?? "");
    expect(name?.textContent).toBe("Docker image");
    expect(note?.className).not.toContain("opacity");
    expect(docker.className).toContain("opacity-45 contrast-more:opacity-60");
    expect(docker.className).not.toContain("hover:");
    const label = docker.labels?.[0] as HTMLElement;
    expect(label.className).toContain("cursor-not-allowed");
    expect(label.querySelector("span.opacity-45")?.textContent).toBe("Docker image");
    await click(label);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("requires a note on an unavailable option", () => {
    // @ts-expect-error: an option that can't be picked says why
    const option: RadioOption = { value: "docker", label: "Docker image", unavailable: true };
    expect(option.value).toBe("docker");
  });

  it("renders only the picked option's field, 24px in, and spaces the options 12px apart then", () => {
    const { container, rerender } = render(
      <RadioGroup label="Connect with" options={ways} value="command" onChange={vi.fn()} />,
    );
    expect(container.querySelector('[aria-label="Command"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Address"]')).toBeNull();
    expect(container.querySelector('[aria-label="Command"]')?.parentElement?.className).toContain(
      "pl-6",
    );
    expect(groupIn(container).className).toContain("gap-3");

    rerender(<RadioGroup label="Connect with" options={ways} value={null} onChange={vi.fn()} />);
    expect(container.querySelector("input:not([type])")).toBeNull();
    expect(groupIn(container).className).toContain("gap-2");
    expect(groupIn(container).className).toContain("phone:gap-0");
    expect(groupIn(container).className).toContain("touch:gap-0");
  });

  it("is at least 48px high per option on a phone or a touch screen", () => {
    const { container } = render(
      <RadioGroup label="Connect with" options={ways} value={null} onChange={vi.fn()} />,
    );
    const label = radiosIn(container)[0]?.labels?.[0] as HTMLElement;
    expect(label.className).toContain("phone:min-h-touch");
    expect(label.className).toContain("touch:min-h-touch");
    expect(label.className).toContain("phone:text-input-touch");
  });

  it("puts the old choice back when the screen does after a failed save", async () => {
    function SavesAtOnce() {
      const [mode, setMode] = useState<Way>("address");
      // The save fails, so the screen keeps the old value.
      const save = (next: Way) => setMode(next === "command" ? mode : next);
      return <RadioGroup label="Connect with" options={ways} value={mode} onChange={save} />;
    }
    const { container } = render(<SavesAtOnce />);
    const [address, command] = radiosIn(container);
    await click(command?.labels?.[0] as HTMLElement);
    expect(address?.checked).toBe(true);
    expect(command?.checked).toBe(false);
  });

  it("takes a danger edge on every circle and aria-invalid when the Field has an error and nothing is picked", () => {
    const { container, rerender } = render(
      <Field label="Connect with" error="Pick a way to connect.">
        <RadioGroup options={ways} value={null} onChange={vi.fn()} />
      </Field>,
    );
    const group = groupIn(container);
    expect(group.getAttribute("aria-invalid")).toBe("true");
    const line = document.getElementById(group.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toContain("Pick a way to connect.");
    const available = radiosIn(container).slice(0, 2);
    for (const radio of available) {
      expect(radio.className).toContain("border-danger");
    }

    rerender(
      <Field label="Connect with" error="Pick a way to connect.">
        <RadioGroup options={ways} value="address" onChange={vi.fn()} />
      </Field>,
    );
    expect(radiosIn(container)[1]?.className).not.toContain("border-danger");
  });
});
