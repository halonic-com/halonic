import type { ItemUsage } from "@halonicjs/app";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { act } from "react";
import {
  type CollectionColumn,
  type CollectionHost,
  CollectionHostService,
  type CollectionRow,
  type CollectionSource,
} from "../collection-host.ts";
import { CollectionPage } from "../ui/collection-page.tsx";
import { fakeModal, restoreModal } from "./modal.ts";
import { render, unmountAll } from "./render.tsx";

// jsdom has no `popover`; the row menu only needs its open and close to exist.
Object.assign(HTMLElement.prototype, {
  showPopover: () => {},
  hidePopover: () => {},
  togglePopover: () => false,
});
fakeModal();
/** What each test file runs after every test. */
export function cleanUp(): void {
  unmountAll();
  restoreModal();
  fakeModal();
}

export const nobody: ItemUsage = { agents: [], hubs: [], routines: [], collections: [] };

export const fields: CollectionColumn[] = [
  { name: "what", type: "text", required: true, computed: false, choices: [] },
  { name: "amount", type: "money", required: true, computed: false, choices: [] },
  { name: "share", type: "money", required: false, computed: true, choices: [] },
];

export const swim: CollectionRow = {
  id: "swim-oct",
  values: { what: "Swim lesson", amount: 60, share: 45 },
};
export const trip: CollectionRow = {
  id: "trip",
  values: { what: "Trip", amount: 20, share: null },
};

export function sourceOf(
  rows: readonly CollectionRow[],
  volatile = false,
  rules: Partial<Pick<CollectionSource, "editCell" | "newRow">> = {},
  columns: readonly CollectionColumn[] = fields,
): CollectionSource {
  return {
    name: "Claims",
    volatile,
    grid: (view) => ({
      fields: columns,
      views: [
        { view: null, count: rows.length },
        { view: "open", count: 1, total: 45 },
      ],
      rows: view === "open" ? rows.slice(0, 1) : rows,
    }),
    editCell: () => ({ ok: true, values: {} }),
    newRow: (typed) => ({ draft: typed, stillNeeded: [] }),
    ...rules,
  };
}

export function setup(
  source: CollectionSource | undefined,
  usage: ItemUsage = nobody,
  writes: Partial<Pick<CollectionHost, "read" | "change" | "add" | "remove" | "rename">> = {},
) {
  const host: CollectionHost = {
    read: async () => source,
    change: async () => "saved",
    add: async () => {},
    remove: async () => {},
    rename: async () => {},
    usage: async () => usage,
    subscribe: () => () => {},
    ...writes,
  };
  const placesOpened: string[] = [];
  const props = {
    item: { kind: "collection", hub: "~workspace", id: "claims" },
    context: {
      services: {
        get: (key: unknown) => (key === CollectionHostService ? host : undefined),
        find: (key: unknown) => (key === CollectionHostService ? host : undefined),
      },
      announcer: { announceState: () => {} },
      openItem: () => {},
      openPlace: (place: string) => placesOpened.push(place),
    },
    Sections: () => null,
  } as unknown as ItemViewProps;
  return { props, host, placesOpened };
}

export async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export async function opened(
  source: CollectionSource | undefined,
  usage?: ItemUsage,
  writes?: Parameters<typeof setup>[2],
) {
  const { props, ...rest } = setup(source, usage, writes);
  const root = render(<CollectionPage {...props} />);
  await settled();
  return { root, ...rest };
}

export function chips(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[role="radiogroup"] label')].map(
    (label) => label.textContent ?? "",
  );
}

export const cell = (root: HTMLElement, row: number, column: number): HTMLElement =>
  root.querySelectorAll("tbody tr")[row]?.querySelectorAll<HTMLElement>("td")[
    column
  ] as HTMLElement;

/** Opens a cell's editor with Enter, types `text` and leaves the cell. */
export async function typeInto(root: HTMLElement, row: number, column: number, text: string) {
  await act(async () => {
    cell(root, row, column).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  const input = cell(root, row, column).querySelector("input") as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(input, text);
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The dialog's Remove: the menu's comes first, so it is the last one. */
export async function pressConfirm(root: HTMLElement) {
  const confirm = [...root.ownerDocument.querySelectorAll("button")]
    .filter((each) => each.textContent?.startsWith("Remove"))
    .at(-1);
  await act(async () => {
    confirm?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export async function pressButton(root: HTMLElement, label: string) {
  const button = [...root.ownerDocument.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith(label),
  );
  await act(async () => {
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export const amountEdit: CollectionSource["editCell"] = (field, text) =>
  Number.isNaN(Number(text))
    ? { ok: false, message: `${field} needs a number.` }
    : { ok: true, values: { [field]: text === "" ? null : Number(text) } };

/** A choice and a yes/no column next to the text and money ones. */
export const richFields: CollectionColumn[] = [
  { name: "what", type: "text", required: true, computed: false, choices: [] },
  { name: "amount", type: "money", required: true, computed: false, choices: [] },
  { name: "kind", type: "choice", required: false, computed: false, choices: ["food", "travel"] },
  { name: "done", type: "boolean", required: false, computed: false, choices: [] },
];
export const meal: CollectionRow = {
  id: "meal",
  values: { what: "Meal", amount: 12, kind: "food", done: false },
};
export const richEdit: CollectionSource["editCell"] = (field, text) => {
  if (field === "amount") return amountEdit(field, text);
  if (field === "done") return { ok: true, values: { done: text === "true" } };
  return { ok: true, values: { [field]: text === "" ? null : text } };
};
export const rich = (rules: Partial<Pick<CollectionSource, "editCell" | "newRow">> = {}) =>
  sourceOf([meal], false, { editCell: richEdit, ...rules }, richFields);

/** Presses a key on a cell, or on the editor inside it when `inside` is set. */
export async function press(
  root: HTMLElement,
  row: number,
  column: number,
  key: string,
  inside = false,
) {
  const target = inside
    ? (cell(root, row, column).querySelector("input, select") as Element)
    : cell(root, row, column);
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Picks a value in a cell's open list. */
export async function pick(root: HTMLElement, row: number, column: number, value: string) {
  const select = cell(root, row, column).querySelector("select") as HTMLSelectElement;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export async function leave(root: HTMLElement, row: number, column: number, tag: string) {
  const control = cell(root, row, column).querySelector(tag) as Element;
  await act(async () => {
    control.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
