// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import {
  type ListSkeletonShape,
  SKELETON_AFTER_MS,
  STILL_LOADING_AFTER_MS,
} from "./list-skeleton.tsx";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

interface LoadingCase {
  readonly heading?: { readonly name: string };
  readonly skeleton?: ListSkeletonShape;
  readonly onRetry?: () => void;
}

function renderLoading({ heading, ...props }: LoadingCase = {}, phone = false) {
  // A List has a heading or a label, never both.
  const list =
    heading === undefined ? (
      <List rows={[]} label="Skills" loading loadingLabel="Loading skills" {...props} />
    ) : (
      <List rows={[]} heading={heading} loading loadingLabel="Loading skills" {...props} />
    );
  const { container } = render(
    phone ? <PresentationProvider presentation="phone">{list}</PresentationProvider> : list,
  );
  return {
    container,
    busy: () => container.querySelector('[aria-busy="true"]'),
    status: () => container.querySelector('[role="status"]'),
    rows: () => Array.from(container.querySelectorAll('[aria-hidden="true"] > div')),
    bars: (kind: string) => container.querySelectorAll(`.bg-surface-muted.${kind}`),
    retry: () =>
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Try again"),
  };
}

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

verifies("kit.list-loading", () => {
  it("shows nothing before 300ms, but is busy with its status line ready", () => {
    const list = renderLoading();
    wait(SKELETON_AFTER_MS - 1);
    expect(list.busy()).not.toBeNull();
    expect(list.status()?.textContent).toBe("");
    expect(list.status()?.className).toBe("sr-only");
    // Screen readers may hold back changes inside a busy element.
    expect(list.status()?.closest("[aria-busy]")).toBeNull();
    expect(list.rows()).toHaveLength(0);
    expect(list.container.querySelector('[role="grid"]')).toBeNull();
  });

  it("shows three hidden skeleton rows after 300ms and says what's loading", () => {
    const list = renderLoading();
    wait(SKELETON_AFTER_MS);
    expect(list.status()?.textContent).toBe("Loading skills");
    expect(list.rows()).toHaveLength(3);
    expect(list.container.querySelector('[aria-hidden="true"]')?.className).toContain(
      "rounded-md border border-border",
    );
    for (const row of list.rows()) {
      expect(row.className).toContain("min-h-14 ");
      expect(row.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("gives each row a title and a meta bar at fixed widths that differ per row", () => {
    const list = renderLoading();
    wait(SKELETON_AFTER_MS);
    const widths = list
      .rows()
      .map((row) =>
        Array.from(row.querySelectorAll(".bg-surface-muted")).map((bar) =>
          bar.className.match(/w-\S+/)?.at(0),
        ),
      );
    expect(widths).toEqual([
      ["w-2/5", "w-7/10"],
      ["w-1/2", "w-3/5"],
      ["w-1/3", "w-2/3"],
    ]);
  });

  it("takes the real rows' shape: a leading avatar or icon, and a trailing bar", () => {
    const withAvatar = renderLoading({ skeleton: { leading: "avatar", trailing: true } });
    wait(SKELETON_AFTER_MS);
    expect(withAvatar.bars("size-7")).toHaveLength(3);
    expect(withAvatar.bars("w-20")).toHaveLength(3);

    unmountAll();
    const withIcon = renderLoading({ skeleton: { leading: "icon" } });
    wait(SKELETON_AFTER_MS);
    expect(withIcon.bars("size-icon-md")).toHaveLength(3);
    expect(withIcon.bars("w-20")).toHaveLength(0);
  });

  it("puts a 48px bar in its heading's place, and keeps the heading for screen readers", () => {
    const list = renderLoading({ heading: { name: "Skills" } });
    wait(SKELETON_AFTER_MS);
    expect(list.bars("w-12")).toHaveLength(1);
    const hidden = list.container.querySelector("h2");
    expect(hidden?.textContent).toBe("Skills");
    expect(hidden?.parentElement?.className).toBe("sr-only");
    expect(hidden?.closest("[aria-busy]")).toBeNull();

    unmountAll();
    const unheaded = renderLoading();
    wait(SKELETON_AFTER_MS);
    expect(unheaded.bars("w-12")).toHaveLength(0);
  });

  it("says Still loading after 10 seconds, and Try again calls onRetry while the rows stay", async () => {
    const onRetry = vi.fn();
    const list = renderLoading({ onRetry });
    wait(STILL_LOADING_AFTER_MS - 1);
    expect(list.retry()).toBeUndefined();
    expect(list.container.textContent).not.toContain("Still loading");

    wait(1);
    expect(list.status()?.textContent).toBe("Still loading");
    const retry = list.retry();
    expect(retry?.className).toContain("min-h-control-sm");

    await click(retry as HTMLButtonElement);
    expect(onRetry).toHaveBeenCalledOnce();
    expect(list.rows()).toHaveLength(3);
  });

  it("on a phone is flush, rows at least 64px, and Try again draws at lg", () => {
    const list = renderLoading({ onRetry: vi.fn() }, true);
    wait(STILL_LOADING_AFTER_MS);
    expect(list.container.querySelector('[aria-hidden="true"]')?.className).not.toContain("border");
    for (const row of list.rows()) {
      expect(row.className).toContain("min-h-16");
    }
    expect(list.retry()?.className).toContain("phone:min-h-control-lg");
  });

  it("shows the rows again when loading ends", () => {
    const { container, rerender } = render(
      <List rows={[{ id: "a", title: "Alpha" }]} label="Skills" loading loadingLabel="Loading" />,
    );
    wait(SKELETON_AFTER_MS);
    rerender(<List rows={[{ id: "a", title: "Alpha" }]} label="Skills" />);
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(container.querySelector('[role="grid"]')?.textContent).toContain("Alpha");
  });

  it("shows the skeleton, not the Empty state, while a list with empty and no rows loads", () => {
    const { container } = render(
      <List
        rows={[]}
        label="Skills"
        empty={{ title: "No skills yet" }}
        loading
        loadingLabel="Loading skills"
      />,
    );
    wait(SKELETON_AFTER_MS);
    expect(container.textContent).not.toContain("No skills yet");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("needs a loadingLabel with loading", () => {
    // @ts-expect-error: a loading List says what's loading
    render(<List rows={[]} label="Skills" loading />);
    expect(true).toBe(true);
  });

  it("moves focus from Try again to the first row when the rows arrive", () => {
    const { rerender } = render(
      <List rows={[]} label="Skills" loading loadingLabel="Loading skills" onRetry={vi.fn()} />,
    );
    wait(STILL_LOADING_AFTER_MS);
    const retry = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    );
    act(() => retry?.focus());
    expect(document.activeElement).toBe(retry);

    rerender(
      <List
        rows={[
          { id: "a", title: "Alpha" },
          { id: "b", title: "Beta" },
        ]}
        label="Skills"
        loading={false}
        loadingLabel="Loading skills"
      />,
    );
    expect(document.activeElement?.textContent).toBe("Alpha");
    expect(document.activeElement?.getAttribute("tabindex")).toBe("0");
  });

  it("moves focus from Try again to the Empty state's title when there are no rows", () => {
    const empty = { title: "No skills yet" };
    const { rerender } = render(
      <List
        rows={[]}
        label="Skills"
        empty={empty}
        loading
        loadingLabel="Loading skills"
        onRetry={vi.fn()}
      />,
    );
    wait(STILL_LOADING_AFTER_MS);
    const retry = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    );
    act(() => retry?.focus());

    rerender(<List rows={[]} label="Skills" empty={empty} />);
    expect(document.activeElement?.tagName).toBe("H2");
    expect(document.activeElement?.textContent).toBe("No skills yet");
  });

  it("leaves focus alone when it wasn't in the skeleton", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    const { rerender } = render(
      <List rows={[]} label="Skills" loading loadingLabel="Loading skills" />,
    );
    act(() => outside.focus());
    rerender(<List rows={[{ id: "a", title: "Alpha" }]} label="Skills" />);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
