// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Avatar } from "../avatar/avatar.tsx";
import { PlainList, PlainRow } from "../plain-list/plain-list.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListRow } from "./list-props.ts";
import { SKELETON_AFTER_MS } from "./list-skeleton.tsx";

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

const rows: readonly ListRow[] = [
  { id: "chief", title: "Chief", meta: "Ship the release notes?", avatar: <Avatar name="Chief" /> },
  { id: "noah", title: "Noah", meta: "Check the Inbox rows", avatar: <Avatar name="Noah" /> },
];

const classesOf = (element: Element | null | undefined) => element?.className.split(" ") ?? [];

/** The element that holds a row's avatar and pads it in from the row's edge. */
function avatarBox(container: HTMLElement, id: string): Element | null | undefined {
  const row =
    container.querySelector(`tr[data-row-id="${id}"] [role="gridcell"]`) ??
    container.querySelector(`li[data-row-id="${id}"]`);
  return row?.querySelector('[aria-hidden="true"]')?.parentElement;
}

verifies("kit.list-plain-edges", () => {
  it("starts a plain List's avatar at a PlainRow's 12px inset, with no space above the first row", () => {
    const { container } = render(
      <>
        <List label="Needs you" rows={rows} onOpen={() => undefined} plain />
        <PlainList label="Chats">
          <PlainRow
            id="chief"
            picture={<Avatar name="Chief" />}
            title="Chief"
            onSelect={() => undefined}
          />
        </PlainList>
      </>,
    );
    const listAvatar = avatarBox(container, "chief");
    expect(classesOf(listAvatar)).toContain("px-3");
    expect(classesOf(listAvatar)).not.toContain("px-4");
    const plainRow = container.querySelector('li[data-row-id="chief"] button');
    expect(classesOf(plainRow)).toContain("px-3");
    // The 4px border spacing above the first row and below the last is taken back by the margin.
    expect(classesOf(container.querySelector('[role="grid"]'))).toEqual(
      expect.arrayContaining(["border-spacing-y-1", "-my-1"]),
    );
  });

  it("keeps a bordered List's 16px inset and no negative margin", () => {
    const { container } = render(<List label="Agents" rows={rows} onOpen={() => undefined} />);
    expect(classesOf(avatarBox(container, "chief"))).toContain("px-4");
    expect(classesOf(container.querySelector('[role="grid"]'))).not.toContain("-my-1");
  });

  it("starts a plain List's headings at 12px and keeps a bordered List's at 16px", () => {
    const heading = { name: "Needs you" };
    const { container } = render(
      <>
        <List heading={heading} rows={rows} onOpen={() => undefined} plain />
        <List
          label="Grouped"
          groups={[{ id: "today", heading: { name: "Today" }, rows }]}
          onOpen={() => undefined}
          plain
        />
        <List heading={{ name: "Notices" }} rows={rows} onOpen={() => undefined} />
      </>,
    );
    const headingNamed = (name: string) =>
      Array.from(container.querySelectorAll("h2, h3")).find((node) => node.textContent === name);
    for (const name of ["Needs you", "Today"]) {
      expect(classesOf(headingNamed(name))).toContain("px-3");
      expect(classesOf(headingNamed(name))).not.toContain("px-4");
    }
    expect(classesOf(headingNamed("Notices"))).toContain("px-4");
  });

  it("pads a plain List's loading heading and rows by 12px, rows 4px apart, so nothing moves when the rows arrive", () => {
    vi.useFakeTimers();
    const loading = (plain: boolean) =>
      render(
        <List
          rows={[]}
          loading
          heading={{ name: "Needs you" }}
          loadingLabel="Loading"
          skeleton={{ leading: "avatar" }}
          plain={plain}
        />,
      ).container;
    const plainList = loading(true);
    const bordered = loading(false);
    act(() => vi.advanceTimersByTime(SKELETON_AFTER_MS));
    const rowsOf = (container: HTMLElement) =>
      Array.from(
        container.querySelectorAll(
          '[aria-busy="true"] [aria-hidden="true"] > div:not(.box-content)',
        ),
      );
    const headingBar = (container: HTMLElement) =>
      container.querySelector('[aria-busy="true"] [aria-hidden="true"].box-content');
    expect(classesOf(headingBar(plainList))).toEqual(expect.arrayContaining(["px-3", "-mb-1"]));
    expect(classesOf(headingBar(bordered))).toContain("px-4");
    expect(rowsOf(plainList)).toHaveLength(3);
    for (const row of rowsOf(plainList)) expect(classesOf(row)).toContain("px-3");
    expect(classesOf(rowsOf(plainList)[0]?.parentElement)).toEqual(
      expect.arrayContaining(["flex", "flex-col", "gap-1"]),
    );
    for (const row of rowsOf(bordered)) expect(classesOf(row)).toContain("px-4");
    expect(classesOf(rowsOf(bordered)[0]?.parentElement)).not.toContain("gap-1");
  });
});
