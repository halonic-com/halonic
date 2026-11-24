// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { ChangeMark, type ChangeMarkProps, changeMarkSelector } from "./change-mark.tsx";

afterEach(unmountAll);

/** A mark for the model's change, with what its buttons were pressed for. */
function mark(props: Partial<ChangeMarkProps> = {}) {
  const pressed: string[] = [];
  const container = render(
    <ChangeMark
      id="field:model"
      sentence="Model: claude → gpt"
      kind="changed"
      before="claude"
      onAccept={() => pressed.push("accept")}
      onReject={() => pressed.push("reject")}
      {...props}
    >
      <input aria-label="Model" defaultValue="gpt" />
    </ChangeMark>,
  );
  const buttons = () => [...container.querySelectorAll("button")].map((each) => each.textContent);
  return { container, pressed, buttons };
}

describe("ChangeMark", () => {
  verifies("shell.change-mark", () => {
    it("marks a changed field as a group named by its sentence, the old value struck through", () => {
      const { container, buttons, pressed } = mark();
      const group = container.querySelector("fieldset");
      expect(group?.getAttribute("aria-label")).toBe("Model: claude → gpt");
      expect(group?.getAttribute("tabindex")).toBe("-1");
      expect(group?.className).toContain("border-accent");
      expect(container.querySelector("del")?.textContent).toBe("claude");
      expect(container.querySelector("input")).not.toBeNull();
      expect(buttons()).toEqual(["Accept", "Reject"]);
      for (const button of container.querySelectorAll("button")) act(() => button.click());
      expect(pressed).toEqual(["accept", "reject"]);
    });

    it("gives an added change a green edge and a removed one its old value in red", () => {
      expect(mark({ kind: "added" }).container.innerHTML).toContain("border-success");
      unmountAll();
      const removed = mark({ kind: "removed" }).container;
      expect(removed.querySelector("fieldset")?.className).toContain("border-danger");
      expect(removed.querySelector("del")?.className).toContain("text-danger");
    });

    it("starts an important change with Important", () => {
      const text = mark({ important: true }).container.querySelector("p")?.textContent;
      expect(text).toBe("ImportantModel: claude → gpt");
    });

    it("says Reject and delete file for the only change of a file the assistant created", () => {
      expect(mark({ deletesFile: true }).buttons()).toEqual(["Accept", "Reject and delete file"]);
    });

    it("shows no decisions while they wait", () => {
      expect(mark({ waiting: true }).buttons()).toEqual([]);
    });

    it("is found by its change's id", () => {
      const { container } = mark();
      expect(container.querySelector(changeMarkSelector("field:model"))).not.toBeNull();
    });
  });
});
