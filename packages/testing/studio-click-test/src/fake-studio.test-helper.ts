import type { StepContext } from "./runner.ts";
import type { Driver } from "./webdriver.ts";

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
  current: string;
  approval: string | undefined;
  readonly context: StepContext;
}

/** A fake Studio whose main window shows `text`. Buttons are added per test. */
export function fakeStudio(text = ""): FakeStudio {
  const studio: FakeStudio = {
    windows: new Map([["main", { text, buttons: new Map() }]]),
    clicks: [],
    typed: [],
    shortcuts: [],
    current: "main",
    approval: undefined,
    context: undefined as unknown as StepContext,
  };
  const window = () => studio.windows.get(studio.current) ?? { text: "", buttons: new Map() };
  const driver: Driver = {
    click: async (xpath) => {
      const name = /normalize-space\(\)='([^']*)'/.exec(xpath)?.[1] ?? xpath;
      const press = window().buttons.get(name);
      if (press === undefined) throw new Error(`no such element: ${name}`);
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
    pageText: async () => window().text,
    describePage: async () => `buttons [${[...window().buttons.keys()].join(" | ")}]`,
    screenshot: async () => new Uint8Array([137, 80, 78, 71]),
    windowHandles: async () => [...studio.windows.keys()],
    switchToWindow: async (handle) => {
      studio.current = handle;
    },
    close: async () => undefined,
  };
  Object.assign(studio, {
    context: {
      driver,
      paperclipUrl: "http://127.0.0.1:3199",
      sleep: async () => undefined,
      shellLog: async () => "engine: crashed 3 times in 5 minutes",
      openShortcut: async (name: string) => {
        studio.shortcuts.push(name);
      },
      mainWindow: "main",
      approveSignIn: async () => studio.approval,
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
