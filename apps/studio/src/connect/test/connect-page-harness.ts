import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressStore, ConnectBridge, ConnectResult } from "../bridge.ts";
import { startConnectPage } from "../connect-page.ts";

// Under jsdom `import.meta.url` isn't a file URL, so the page is found from
// the package folder, where Vitest runs each package's tests.
const pageFile = join(process.cwd(), "connect.html");

/** A shell that answers each Connect from a list, and records what it was asked. */
export class FakeShell implements ConnectBridge {
  readonly asked: string[] = [];
  readonly opened: string[] = [];
  releasePageOpened = 0;
  /** Makes opening the release page fail, as a shell without a browser would. */
  releasePageFails = false;
  private readonly answers: (ConnectResult | Error | Promise<ConnectResult>)[] = [];

  /** The answers to give, in order. An `Error` makes the call fail. */
  answer(...answers: (ConnectResult | Error)[]): this {
    this.answers.push(...answers);
    return this;
  }

  /** The next answer stays pending until the test calls the returned function. */
  answerLater(): (result: ConnectResult) => Promise<void> {
    const { promise, resolve } = Promise.withResolvers<ConnectResult>();
    this.answers.push(promise);
    return async (result) => {
      resolve(result);
      await settled();
    };
  }

  connect(address: string): Promise<ConnectResult> {
    this.asked.push(address);
    const next = this.answers.shift();
    if (next === undefined) {
      throw new Error(`The test gave no answer for "${address}".`);
    }
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    return Promise.resolve(next);
  }

  openStudio(url: string): void {
    this.opened.push(url);
  }

  openReleasePage(): Promise<void> {
    this.releasePageOpened += 1;
    return this.releasePageFails
      ? Promise.reject(new Error("No browser to open the release page."))
      : Promise.resolve();
  }
}

export class MemoryStore implements AddressStore {
  address: string | undefined;

  constructor(address?: string) {
    this.address = address;
  }

  load(): string | undefined {
    return this.address;
  }

  save(address: string): void {
    this.address = address;
  }
}

/**
 * Lets every pending promise callback run. It waits for no time: the
 * shell's answers are already resolved, so one task turn is enough.
 */
export function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Puts `connect.html`'s body in the test document and starts the page on it. */
export async function openPage(
  shell: FakeShell,
  store: AddressStore,
  options: { changeAddress?: boolean } = {},
): Promise<ConnectPageView> {
  const html = readFileSync(pageFile, "utf8");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
  await startConnectPage({
    document,
    bridge: shell,
    store,
    changeAddress: options.changeAddress ?? false,
  });
  return new ConnectPageView();
}

/** What a user sees and touches on the page. */
export class ConnectPageView {
  get field(): HTMLInputElement {
    return this.find("#address");
  }

  get fieldError(): HTMLElement {
    return this.find("#address-error");
  }

  get connectButton(): HTMLButtonElement {
    return this.find('[data-action="connect"]');
  }

  /** The one screen that isn't hidden. */
  get screen(): string {
    const shown = [...document.querySelectorAll<HTMLElement>("[data-screen]")].filter(
      (screen) => !screen.hidden,
    );
    if (shown.length !== 1) {
      throw new Error(`Expected one screen, found ${shown.length}.`);
    }
    return shown[0]?.dataset["screen"] ?? "";
  }

  /** The line under the logo while the remembered address is checked. */
  get startingStatus(): HTMLElement {
    return this.find('[data-screen="starting"] [role="status"]');
  }

  /** The shown screen's message, for the shell's own screens. */
  get message(): HTMLElement {
    return this.find(`[data-screen="${this.screen}"] .message`);
  }

  /** A button on the shown screen, by its `data-action`. */
  button(action: string): HTMLButtonElement {
    return this.find(`[data-screen="${this.screen}"] [data-action="${action}"]`);
  }

  async type(text: string): Promise<void> {
    this.field.value = text;
    this.field.dispatchEvent(new Event("input", { bubbles: true }));
    await settled();
  }

  async press(button: HTMLButtonElement): Promise<void> {
    button.focus();
    button.click();
    await settled();
  }

  private find<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (element === null) {
      throw new Error(`No element for "${selector}".`);
    }
    return element;
  }
}
