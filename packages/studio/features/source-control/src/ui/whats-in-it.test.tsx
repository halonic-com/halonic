// @vitest-environment jsdom
import type { ChangeLine } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import type { ChangeItem } from "../change-items.ts";
import { versionWords } from "../changes-words.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { WhatsInIt } from "./whats-in-it.tsx";

afterEach(unmountAll);

const line = (sentence: string, important = false): ChangeLine => ({
  id: sentence,
  sentence,
  important,
  parts: [],
});

/** An invented workflow with `lines` as its changes. */
function workflow(name: string, lines: readonly ChangeLine[]): ChangeItem {
  const path = `workflows/${name}.workflow.yaml`;
  return {
    id: `workflow::${name}`,
    name,
    itemId: name,
    kind: "workflow",
    hub: "",
    sentence: lines[0]?.sentence ?? "",
    files: [
      { path, description: { path, kind: "workflow", lines, described: true }, texts: undefined },
    ],
  };
}

const plain = workflow("Acme refunds", [line("New")]);
const important = workflow("Acme payouts", [line("Budget raised", true), line("Step added")]);

/** The row of the item named `name`: its Checkbox and what sits beside it. */
function rowOf(name: string): HTMLElement {
  const container = render(
    <WhatsInIt items={[plain, important]} ticked={new Set()} onTick={() => undefined} />,
  );
  const item = [...container.querySelectorAll("section > ul > li")].find((each) =>
    each.textContent?.includes(name),
  );
  const row = item?.querySelector(":scope > div");
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${name}`);
  return row;
}

const classesOf = (element: Element | null | undefined) => element?.className.split(" ") ?? [];

// jsdom lays nothing out, so these read the classes that place each part, as the kit's own tests
// of the rule do. The pixels are measured in a browser on HAL-21123.
verifies("kit.checkbox-words", () => {
  describe("a What's in it row", () => {
    it("starts at the top, on the Checkbox's first line, and isn't centred on its 48px", () => {
      const row = classesOf(rowOf("Acme refunds"));
      expect(row).toContain("items-start");
      expect(row).not.toContain("items-center");
    });

    it("gives the icon, name and kind one line of the Checkbox, so the box sits mid-way beside them", () => {
      const words = rowOf("Acme refunds").querySelector("label > span:nth-of-type(2)");
      expect(words?.textContent).toContain("Acme refunds");
      expect(classesOf(words)).toEqual(expect.arrayContaining(["min-h-lh", "items-center"]));
    });

    it("starts the inline sentence 12px down on a phone or a touch screen, mid-way on a phone's 24px line", () => {
      const sentence = rowOf("Acme refunds").querySelector(":scope > span[id]");
      expect(sentence?.textContent).toContain("New");
      expect(classesOf(sentence)).toEqual(
        expect.arrayContaining(["phone:mt-3", "touch:mt-3", "phone:py-0.5"]),
      );
    });

    it("puts the Important chip mid-way on that line too", () => {
      const chip = rowOf("Acme payouts").querySelector(":scope > span.rounded-full");
      expect(chip?.textContent).toBe(versionWords.important);
      expect(classesOf(chip)).toEqual(
        expect.arrayContaining([
          "phone:mt-3",
          "touch:mt-3",
          "-translate-y-px",
          "phone:translate-y-px",
        ]),
      );
    });
  });
});
