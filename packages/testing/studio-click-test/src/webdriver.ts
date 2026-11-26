// The few W3C WebDriver commands the click test needs, over fetch. msedgedriver
// speaks plain WebDriver, so a client library (and the browser downloads its
// install scripts bring) would add nothing but supply chain.

const elementKey = "element-6066-11e4-a52e-4f735466cecf";

/** The W3C key values for the keys that have no character of their own. */
export const keys = {
  enter: "\uE007",
  escape: "\uE00C",
  shift: "\uE008",
  control: "\uE009",
} as const;

/** A window's outer size, in CSS pixels. */
export interface WindowSize {
  readonly width: number;
  readonly height: number;
}

/** One open WebDriver session on the installed Studio. */
export interface Driver {
  /** Clicks the first element the XPath finds; throws when none is shown. */
  click(xpath: string): Promise<void>;
  /** Types text into the first element the XPath finds. */
  type(xpath: string, text: string): Promise<void>;
  /** Presses the keys together, as a shortcut, and lets them go in reverse order. */
  pressKeys(keys: readonly string[]): Promise<void>;
  /** The value of an attribute of the first element the XPath finds, or null when it has none. */
  attribute(xpath: string, name: string): Promise<string | null>;
  /** The computed value of a CSS property of the first element the XPath finds, such as `rgb(…)`. */
  cssValue(xpath: string, property: string): Promise<string>;
  /** The visible text of the current window's page. */
  pageText(): Promise<string>;
  /** The current window's title, as the task bar shows it. */
  title(): Promise<string>;
  /** How many elements the XPath finds, shown or not. */
  count(xpath: string): Promise<number>;
  /** A one-line summary of the page for a failing step: its size, focus, buttons and alerts. */
  describePage(): Promise<string>;
  /** A PNG of the current window. */
  screenshot(): Promise<Uint8Array>;
  /** The handles of every window the app has open. */
  windowHandles(): Promise<string[]>;
  /** Makes the window with this handle the current one. */
  switchToWindow(handle: string): Promise<void>;
  /** Closes the current window; the session goes on in the others. */
  closeWindow(): Promise<void>;
  /** The current window's outer size. */
  windowSize(): Promise<WindowSize>;
  /** Sizes the current window and resolves to the size it got, which a small screen may cap. */
  setWindowSize(size: WindowSize): Promise<WindowSize>;
  /** Ends the session, which closes the app. */
  close(): Promise<void>;
}

/** A WebDriver command the server answered with an error. */
export class WebDriverError extends Error {
  /** The W3C error code, such as `no such element`. */
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "WebDriverError";
    this.code = code;
  }
}

/**
 * Attaches msedgedriver to the running app's WebView2 and returns the
 * session. `debuggerAddress` is the DevTools port the app's WebView2 opened,
 * such as `127.0.0.1:9222`. The app is started beforehand, not by the driver:
 * the shell's own browser arguments beat the variable msedgedriver would
 * use to open that port.
 */
export async function openSession(serverUrl: string, debuggerAddress: string): Promise<Driver> {
  const base = serverUrl.replace(/\/$/, "");
  const created = await command(base, "POST", "/session", {
    capabilities: {
      alwaysMatch: { browserName: "webview2", "ms:edgeOptions": { debuggerAddress } },
    },
  });
  const sessionId = readString(created, "sessionId");
  const session = `${base}/session/${encodeURIComponent(sessionId)}`;
  const call = (method: string, path: string, body?: unknown) =>
    command(session, method, path, body);
  const find = async (xpath: string): Promise<string> => {
    const found = await call("POST", "/element", { using: "xpath", value: xpath });
    return readElement(found);
  };
  return {
    click: async (xpath) => {
      await call("POST", `/element/${await find(xpath)}/click`, {});
    },
    type: async (xpath, text) => {
      await call("POST", `/element/${await find(xpath)}/value`, { text });
    },
    pressKeys: async (keys) => {
      const down = keys.map((value) => ({ type: "keyDown", value }));
      const up = [...keys].reverse().map((value) => ({ type: "keyUp", value }));
      await call("POST", "/actions", {
        actions: [{ type: "key", id: "keyboard", actions: [...down, ...up] }],
      });
      await call("DELETE", "/actions");
    },
    attribute: async (xpath, name) => {
      const element = await find(xpath);
      const value = await call("GET", `/element/${element}/attribute/${encodeURIComponent(name)}`);
      return typeof value === "string" ? value : null;
    },
    cssValue: async (xpath, property) => {
      const element = await find(xpath);
      const value = await call("GET", `/element/${element}/css/${encodeURIComponent(property)}`);
      return typeof value === "string" ? value : "";
    },
    pageText: async () => {
      const text = await call("POST", "/execute/sync", {
        script: "return document.body.innerText;",
        args: [],
      });
      return typeof text === "string" ? text : "";
    },
    title: async () => {
      const title = await call("GET", "/title");
      return typeof title === "string" ? title : "";
    },
    count: async (xpath) => {
      const found = await call("POST", "/elements", { using: "xpath", value: xpath });
      return Array.isArray(found) ? found.length : 0;
    },
    describePage: async () => {
      const summary = await call("POST", "/execute/sync", { script: describeScript, args: [] });
      return typeof summary === "string" ? summary : "";
    },
    screenshot: async () => {
      const base64 = await call("GET", "/screenshot");
      if (typeof base64 !== "string")
        throw new WebDriverError("unknown error", "the screenshot isn't text");
      return Uint8Array.from(Buffer.from(base64, "base64"));
    },
    windowHandles: async () => {
      const handles = await call("GET", "/window/handles");
      return Array.isArray(handles) ? handles.filter((handle) => typeof handle === "string") : [];
    },
    switchToWindow: async (handle) => {
      await call("POST", "/window", { handle });
    },
    closeWindow: async () => {
      await call("DELETE", "/window");
    },
    windowSize: async () => readSize(await call("GET", "/window/rect")),
    setWindowSize: async ({ width, height }) =>
      readSize(await call("POST", "/window/rect", { width, height })),
    close: async () => {
      await call("DELETE", "");
    },
  };
}

// Runs in the page. Names every shown button the way a person would read it,
// so a step that can't find one says what was there instead.
const describeScript = `
  const shown = (element) => element.getClientRects().length > 0;
  const name = (element) =>
    (element.getAttribute("aria-label") || element.innerText || "").replace(/\\s+/g, " ").trim();
  const buttons = [...document.querySelectorAll("button, [role=button]")].filter(shown).map(name);
  const alerts = [...document.querySelectorAll("[role=alert], [role=status]")].map(name);
  const active = document.activeElement;
  return [
    "window " + innerWidth + "x" + innerHeight,
    "focus " + (active ? active.tagName + " " + name(active).slice(0, 40) : "none"),
    "buttons [" + buttons.filter((text) => text !== "").join(" | ") + "]",
    "alerts [" + alerts.filter((text) => text !== "").join(" | ") + "]",
  ].join("; ");
`;

async function command(
  base: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(`${base}${path}`, init);
  const parsed: unknown = await response.json();
  const value = isRecord(parsed) ? parsed["value"] : undefined;
  if (!response.ok) {
    const error =
      isRecord(value) && typeof value["error"] === "string"
        ? value["error"]
        : `HTTP ${response.status}`;
    const message = isRecord(value) && typeof value["message"] === "string" ? value["message"] : "";
    throw new WebDriverError(error, message);
  }
  return value;
}

function readString(value: unknown, key: string): string {
  const field = isRecord(value) ? value[key] : undefined;
  if (typeof field !== "string")
    throw new WebDriverError("unknown error", `the answer has no ${key}`);
  return field;
}

function readSize(value: unknown): WindowSize {
  const width = isRecord(value) ? value["width"] : undefined;
  const height = isRecord(value) ? value["height"] : undefined;
  if (typeof width !== "number" || typeof height !== "number") {
    throw new WebDriverError("unknown error", "the window rect has no width and height");
  }
  return { width, height };
}

// msedgedriver attached through debuggerAddress may answer with the older
// JSON Wire key; run 45625816001 got an element without the W3C one.
function readElement(value: unknown): string {
  const field = isRecord(value) ? (value[elementKey] ?? value["ELEMENT"]) : undefined;
  if (typeof field !== "string") {
    const answer = JSON.stringify(value) ?? String(value);
    throw new WebDriverError(
      "unknown error",
      `the element answer has no id: ${answer.slice(0, 300)}`,
    );
  }
  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
