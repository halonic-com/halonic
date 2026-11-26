// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Avatar } from "../avatar/avatar.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { PlainList, PlainRow, type PlainRowProps } from "./plain-list.tsx";

afterEach(unmountAll);

type RowOptions = Partial<PlainRowProps>;

function renderRow(options: RowOptions = {}) {
  const { container } = render(
    <PlainList label="Chats">
      <PlainRow
        id="chat-chief"
        picture={<Avatar name="Chief" />}
        title="Chief"
        line="Shall I merge #12?"
        time="09:30"
        onSelect={() => undefined}
        {...options}
      />
    </PlainList>,
  );
  const row = container.querySelector('[data-row-id="chat-chief"]') as HTMLElement;
  const button = row.querySelector("button") as HTMLButtonElement;
  const [titleLine, line] = [...(button.lastElementChild?.children ?? [])] as HTMLElement[];
  const title = titleLine?.querySelector("bdi")?.parentElement as HTMLElement;
  const lineText = line?.firstElementChild as HTMLElement;
  return { container, row, button, title, lineText };
}

const classesOf = (element: HTMLElement) => element.className.split(" ");

verifies("kit.plain-list", () => {
  it("draws an unread row with a semibold title, a full-colour line and its count", () => {
    const { container, button, title, lineText } = renderRow({
      unread: { label: " unread", count: "2" },
    });

    expect(container.querySelector("ul")?.getAttribute("aria-label")).toBe("Chats");
    expect(classesOf(title)).toContain("font-semibold");
    expect(classesOf(lineText)).toContain("text-fg");
    expect(button.querySelector("[data-unread]")?.textContent).toBe("2 unread");
    expect(button.textContent).toContain("2 unread");
  });

  it("draws a read row with a regular title, a muted line and no mark", () => {
    const { button, title, lineText } = renderRow();

    expect(classesOf(title)).toContain("text-body");
    expect(classesOf(title)).not.toContain("font-semibold");
    expect(classesOf(lineText)).toContain("text-fg-muted");
    expect(button.querySelector("[data-unread]")).toBeNull();
  });

  it("draws a blue dot for an unread row without a count, named for screen readers", () => {
    const { button } = renderRow({ unread: { label: "unread" } });
    const dot = button.querySelector("[data-unread]") as HTMLElement;

    expect(classesOf(dot)).toEqual(expect.arrayContaining(["rounded-full", "bg-primary"]));
    expect(dot.textContent).toBe("unread");
  });

  it("marks the current row and draws the flag as a violet dot with its words", () => {
    const { button } = renderRow({ current: true, flag: "needs you" });
    const flag = button.querySelector("[data-flag]") as HTMLElement;

    expect(button.getAttribute("aria-current")).toBe("true");
    expect(classesOf(button)).toContain("aria-[current=true]:bg-surface-muted");
    expect(classesOf(flag)).toEqual(expect.arrayContaining(["size-1.5", "bg-warning"]));
    expect(flag.textContent).toBe("needs you");
  });

  it("runs the action from a button of its own, in the time's place, without selecting", () => {
    const onSelect = vi.fn();
    const onClick = vi.fn();
    const { row, button } = renderRow({ onSelect, action: { label: "Mark as unread", onClick } });
    const action = row.querySelector(":scope > button:last-child") as HTMLButtonElement;
    const time = [...button.querySelectorAll("span")].find((span) => span.textContent === "09:30");

    expect(action.textContent).toBe("Mark as unread");
    expect(button.contains(action)).toBe(false);
    expect(classesOf(time as HTMLElement)).toContain("group-hover:invisible");
    act(() => action.click());
    expect(onClick).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();

    act(() => button.click());
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
