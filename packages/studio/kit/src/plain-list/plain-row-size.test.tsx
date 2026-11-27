// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Avatar } from "../avatar/avatar.tsx";
import { List } from "../list/list.tsx";
import type { ListRow } from "../list/list-props.ts";
import { SKELETON_AFTER_MS } from "../list/list-skeleton.tsx";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { PlainList, PlainRow } from "./plain-list.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const classesOf = (element: Element | null | undefined) => element?.className.split(" ") ?? [];

const row: ListRow = {
  id: "notes",
  title: "Approve the release notes",
  meta: "Release 0.2 · Liam",
  avatar: <Avatar name="Liam" size="sidebar" />,
};

/** A List's row: its main cell's inside, its avatar's place, its title and its meta line. */
function renderListRow(plain: boolean, phone = false) {
  const list = (
    <List heading={{ name: "Needs you" }} rows={[row]} onOpen={() => undefined} plain={plain} />
  );
  const { container } = render(
    phone ? <PresentationProvider presentation="phone">{list}</PresentationProvider> : list,
  );
  const cell = container.querySelector('[role="gridcell"]') as HTMLElement;
  const inside = cell.querySelector("div") as HTMLElement;
  const spans = [...inside.querySelectorAll("span")];
  return {
    inside,
    leading: inside.firstElementChild,
    title: spans.find((span) => span.textContent === row.title),
    meta: spans.find((span) => span.textContent === row.meta),
  };
}

verifies("kit.plain-row-size", () => {
  it("draws a PlainRow exactly 72px high, 6px padded, with a 15px title over a 14px line", () => {
    const { container } = render(
      <PlainList label="Chats">
        <PlainRow
          id="chief"
          picture={<Avatar name="Chief" size="sidebar" />}
          title="Chief"
          line="Shall I merge #12?"
          onSelect={() => undefined}
        />
      </PlainList>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    const [titleLine, line] = [...(button.lastElementChild?.children ?? [])];

    // A fixed height, not a minimum: the board measured taller rows in Preview .440 (HAL-20558).
    expect(classesOf(button)).toEqual(expect.arrayContaining(["h-row", "py-1.5"]));
    expect(classesOf(button)).not.toContain("min-h-row");
    expect(classesOf(button.firstElementChild)).toContain("size-12");
    expect(classesOf(titleLine?.querySelector("bdi")?.parentElement)).toContain("text-reading");
    expect(classesOf(line?.firstElementChild)).toContain("text-body");
  });

  it("keeps a PlainRow without a picture at the 56px row, 12px padded", () => {
    const { container } = render(
      <PlainList label="Recent chats">
        <PlainRow id="login" picture={null} title="Fix the login test" onSelect={() => undefined} />
      </PlainList>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;

    expect(classesOf(button)).toEqual(expect.arrayContaining(["min-h-14", "py-3"]));
    expect(classesOf(button)).not.toContain("min-h-row");
    expect(classesOf(button)).not.toContain("py-1.5");
  });

  it("draws a plain List's row 72px high with a 48px avatar, a 15px title, a 14px line", () => {
    const { inside, leading, title, meta } = renderListRow(true);

    expect(classesOf(inside)).toEqual(expect.arrayContaining(["h-row", "py-1.5"]));
    expect(classesOf(leading)).toContain("size-12");
    expect(classesOf(title)).toContain("text-reading");
    expect(classesOf(meta)).toContain("text-body");
  });

  it("keeps a List that isn't plain at its sizes", () => {
    const { inside, leading, title, meta } = renderListRow(false);

    expect(classesOf(inside)).toContain("min-h-14");
    expect(classesOf(inside)).not.toContain("min-h-row");
    expect(classesOf(leading)).toContain("size-7");
    expect(classesOf(title)).toContain("text-body-strong");
    expect(classesOf(meta)).toContain("text-small");
  });

  it("draws the sidebar Avatar on a 48px tile, initials and picture alike", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(1);
    const initials = render(<Avatar name="Ada Lovelace" size="sidebar" />).container
      .firstElementChild as HTMLElement;
    const pictured = render(
      <Avatar name="Ada" size="sidebar" picture={{ width: 400, height: 400 } as ImageBitmap} />,
    ).container.firstElementChild as HTMLElement;
    const canvas = pictured.querySelector("canvas") as HTMLCanvasElement;

    expect(initials.textContent).toBe("AL");
    expect(classesOf(initials)).toEqual(expect.arrayContaining(["size-12", "text-heading"]));
    expect(classesOf(pictured)).toContain("size-12");
    expect([canvas.width, canvas.height]).toEqual([48, 48]);
  });

  it("keeps a plain List's row 72px on a phone, with its 48px avatar", () => {
    const { inside, leading } = renderListRow(true, true);

    expect(classesOf(inside)).toEqual(expect.arrayContaining(["h-row", "py-1.5"]));
    expect(classesOf(inside)).not.toContain("min-h-14");
    expect(classesOf(leading)).toContain("size-12");
  });

  it("loads a plain List in 72px rows with a 48px round block, and other Lists at 56px", () => {
    vi.useFakeTimers();
    const loading = (plain: boolean) =>
      render(
        <List
          rows={[]}
          label="Needs you"
          loading
          loadingLabel="Loading the Inbox"
          skeleton={{ leading: "avatar" }}
          plain={plain}
        />,
      ).container;
    const [plainList, boxed] = [loading(true), loading(false)];
    act(() => vi.advanceTimersByTime(SKELETON_AFTER_MS));
    const firstRow = (container: HTMLElement) =>
      container.querySelector('[aria-hidden="true"] > div') as HTMLElement;

    expect(classesOf(firstRow(plainList))).toEqual(expect.arrayContaining(["h-row", "py-1.5"]));
    expect(classesOf(firstRow(plainList))).not.toContain("min-h-row");
    expect(classesOf(firstRow(plainList).firstElementChild)).toContain("size-12");
    expect(classesOf(firstRow(boxed))).toContain("min-h-14");
    expect(classesOf(firstRow(boxed).firstElementChild)).toContain("size-7");
  });
});
