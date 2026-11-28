import type { CardRecord } from "./card-seed.ts";
import type { StepContext } from "./runner.ts";
import type { TestPaperclip } from "./test-paperclip.ts";
import type { Driver, WindowSize } from "./webdriver.ts";

/** A window of the fake Studio: its text, and what each button click does to it. */
export interface FakeWindow {
  text: string;
  readonly buttons: Map<string, () => void>;
}

/** A Studio stand-in that answers the driver from scripted windows, and the context around it. */
export interface FakeStudio {
  readonly windows: Map<string, FakeWindow>;
  readonly clicks: string[];
  readonly typed: string[];
  readonly shortcuts: string[];
  /** The page root's attributes, such as `data-theme`. */
  readonly rootAttributes: Map<string, string>;
  current: string;
  /** The window title the driver reads. */
  title: string;
  /** How many elements each XPath finds; one it doesn't name finds none. */
  readonly elements: Map<string, number>;
  /** The computed background colour each XPath's element has; one it doesn't name has none. */
  readonly backgrounds: Map<string, string>;
  /** The computed height each XPath's element has; one it doesn't name has none. */
  readonly heights: Map<string, string>;
  /** Any other computed value, keyed `<xpath> <property>`, such as `//li white-space`. */
  readonly styles: Map<string, string>;
  /**
   * Buttons that a hidden copy comes before in the page, such as a closed menu's row: a click
   * reaches the shown one only through the XPath scope named here, and otherwise isn't interactable.
   */
  readonly shownWithin: Map<string, string>;
  approval: string | undefined;
  /** What the fake test Paperclip answers: the card's status, the chat's comments, the key. */
  readonly paperclip: { status: string; comments: string[]; keyWorks: boolean | undefined };
  /** The seeded cards' copies by id, `inbox-<key>` and `messenger-<key>`; undefined fails the seed. */
  cards: Map<string, CardRecord> | undefined;
  /** The main window's size; the installed app opens at 800 × 600. */
  windowSize: WindowSize;
  /** Every size a step set, in order. */
  readonly resizes: WindowSize[];
  /** Set to make the driver refuse to size the window, with this error. */
  resizeRefusal: string | undefined;
  readonly context: StepContext;
}

/** A fake Studio whose main window shows `text`. Buttons are added per test. */
export function fakeStudio(text = ""): FakeStudio {
  const studio: FakeStudio = {
    windows: new Map([["main", { text, buttons: new Map() }]]),
    clicks: [],
    typed: [],
    shortcuts: [],
    rootAttributes: new Map(),
    current: "main",
    title: "",
    elements: new Map(),
    backgrounds: new Map(),
    heights: new Map(),
    styles: new Map(),
    shownWithin: new Map(),
    approval: undefined,
    paperclip: { status: "pending", comments: [], keyWorks: true },
    cards: new Map(),
    windowSize: { width: 800, height: 600 },
    resizes: [],
    resizeRefusal: undefined,
    context: undefined as unknown as StepContext,
  };
  const window = () => studio.windows.get(studio.current) ?? { text: "", buttons: new Map() };
  const driver: Driver = {
    click: async (xpath) => {
      // A button or an option, named in full or by how it starts, or a row by the text it holds.
      const name = /normalize-space\(\)(?:[=,]|, )'([^']*)'/.exec(xpath)?.[1] ?? xpath;
      const press = window().buttons.get(name);
      if (press === undefined) throw new Error(`no such element: ${name}`);
      const scope = studio.shownWithin.get(name);
      if (scope !== undefined && !xpath.startsWith(scope))
        throw new Error(`element not interactable: ${name}`);
      studio.clicks.push(name);
      press();
    },
    type: async (_xpath, text) => {
      studio.typed.push(text);
    },
    // A shortcut works like a button named after its keys, joined with "+".
    pressKeys: async (keys) => {
      const name = keys.join("+");
      const press = window().buttons.get(name);
      if (press === undefined) throw new Error(`no shortcut: ${name}`);
      studio.clicks.push(name);
      press();
    },
    attribute: async (_xpath, name) => studio.rootAttributes.get(name) ?? null,
    cssValue: async (xpath, property) =>
      studio.styles.get(`${xpath} ${property}`) ??
      (property === "height" ? studio.heights : studio.backgrounds).get(xpath) ??
      "",
    pageText: async () => window().text,
    title: async () => studio.title,
    // The fake names each window by its label, as Tauri does.
    windowLabel: async () => studio.current,
    count: async (xpath) => studio.elements.get(xpath) ?? 0,
    describePage: async () => `buttons [${[...window().buttons.keys()].join(" | ")}]`,
    screenshot: async () => new Uint8Array([137, 80, 78, 71]),
    windowHandles: async () => [...studio.windows.keys()],
    switchToWindow: async (handle) => {
      studio.current = handle;
    },
    closeWindow: async () => {
      studio.windows.delete(studio.current);
    },
    windowSize: async () => studio.windowSize,
    setWindowSize: async (size) => {
      if (studio.resizeRefusal !== undefined) throw new Error(studio.resizeRefusal);
      studio.resizes.push(size);
      studio.windowSize = size;
      return size;
    },
    close: async () => undefined,
  };
  const paperclip: TestPaperclip = {
    seeded: {
      companyId: "company-1",
      approvalId: "approval-1",
      chatId: "chat-1",
      cardsFile: "cards.json",
    },
    approvalStatus: async () => studio.paperclip.status,
    chatComments: async () => studio.paperclip.comments,
    studioKeyWorks: async () => studio.paperclip.keyWorks,
    seedCard: async (fixture) => {
      const cards = studio.cards;
      if (cards === undefined) throw new Error("the agent never posted the card");
      for (const copy of ["inbox", "messenger"]) {
        cards.set(`${copy}-${fixture.key}`, { status: "pending", result: null });
      }
      return {
        Inbox: { issueId: `task-${fixture.key}`, id: `inbox-${fixture.key}` },
        Messenger: { issueId: "chat-1", id: `messenger-${fixture.key}` },
      };
    },
    card: async (ref) => studio.cards?.get(ref.id) ?? { status: "missing", result: null },
  };
  Object.assign(studio, {
    context: {
      driver,
      paperclipUrl: "http://127.0.0.1:3199",
      sleep: async () => undefined,
      shellLog: async () => "engine: crashed 3 times in 5 minutes",
      // A start with arguments is kept as the name and its arguments, such as "Halonic --app ask".
      openShortcut: async (name: string, args: readonly string[] = []) => {
        studio.shortcuts.push([name, ...args].join(" "));
      },
      mainWindow: "main",
      approveSignIn: async () => studio.approval,
      paperclip,
    } satisfies StepContext,
  });
  return studio;
}

/** Adds a button to a window of the fake Studio. */
export function button(
  studio: FakeStudio,
  windowName: string,
  name: string,
  press: () => void = () => undefined,
) {
  studio.windows.get(windowName)?.buttons.set(name, press);
}

/**
 * Draws a sidebar row at `parts.row` with the heights given for it and its picture, the kit's by
 * default. Whether the picture shows, rather than initials, each test sets itself.
 */
export function drawRow(
  studio: FakeStudio,
  parts: { readonly row: string; readonly picture: string },
  rowHeight = "72px",
  pictureHeight = "48px",
): void {
  studio.elements.set(parts.row, 1);
  studio.heights.set(parts.row, rowHeight);
  studio.heights.set(parts.picture, pictureHeight);
}

/** The computed values `drawRowFit` sets, the kit's for an Inbox row by default. */
export interface RowFitStyles {
  readonly titleClamp: string;
  readonly titleLineHeight: string;
  readonly metaWhiteSpace: string;
  readonly metaOverflow: string;
  readonly badgeHeight: string;
}

/**
 * Draws an Inbox row's title, meta line and avatar badge at `parts` with the computed values
 * given, the kit's by default: the title clamped to two 20px lines, the meta line cut on one,
 * and a 20px badge.
 */
export function drawRowFit(
  studio: FakeStudio,
  parts: { readonly title: string; readonly meta: string; readonly badge: string },
  styles: Partial<RowFitStyles> = {},
): void {
  for (const part of [parts.title, parts.meta, parts.badge]) studio.elements.set(part, 1);
  studio.styles.set(`${parts.title} -webkit-line-clamp`, styles.titleClamp ?? "2");
  studio.styles.set(`${parts.title} line-height`, styles.titleLineHeight ?? "20px");
  studio.styles.set(`${parts.meta} white-space`, styles.metaWhiteSpace ?? "nowrap");
  studio.styles.set(`${parts.meta} text-overflow`, styles.metaOverflow ?? "ellipsis");
  studio.heights.set(parts.badge, styles.badgeHeight ?? "20px");
}

/** Draws an element at `xpath` with the computed values given, keyed by CSS property. */
export function drawStyles(
  studio: FakeStudio,
  xpath: string,
  values: Readonly<Record<string, string>>,
): void {
  studio.elements.set(xpath, 1);
  for (const [property, value] of Object.entries(values)) {
    studio.styles.set(`${xpath} ${property}`, value);
  }
}

/**
 * Draws a chat's message box at `textarea` inside its kit box at `box`, with the kit's 26px corners
 * and 52px least height unless `values` says otherwise.
 */
export function drawComposer(
  studio: FakeStudio,
  parts: { readonly textarea: string; readonly box: string },
  values: Readonly<Record<string, string>> = {},
): void {
  studio.elements.set(parts.textarea, 1);
  drawStyles(studio, parts.box, {
    "border-top-left-radius": "26px",
    "min-height": "52px",
    ...values,
  });
}
