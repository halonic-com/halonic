import type { AddressStore, ConnectBridge, ConnectResult } from "./bridge.ts";
import { type Piece, words } from "./words.ts";

export interface ConnectPageOptions {
  readonly document: Document;
  readonly bridge: ConnectBridge;
  readonly store: AddressStore;
  /**
   * True when the shell opened the page to change the address (the served
   * About page's Change address link, or Android back). The page then shows
   * the connect screen with the address filled in instead of connecting.
   */
  readonly changeAddress: boolean;
}

type ScreenName = "starting" | "connect" | "not-answering" | "app-too-old" | "computer-too-old";

/** Where a hello call started, which decides where "isn't answering" shows. */
type Origin = "connect-screen" | "elsewhere";

/**
 * How long the starting screen shows only the logo. A quick answer never
 * shows a word; a slow one says "Connecting…" so screen readers have
 * something to read (checklist section 0).
 */
const quietStartMs = 1000;

/**
 * Runs the connect page: the connect screen, "isn't answering" and the two
 * version screens (flow-install-update 5.3, 5.4 and 7.3).
 */
export async function startConnectPage(options: ConnectPageOptions): Promise<void> {
  const page = new ConnectPage(options);
  await page.start(options.changeAddress);
}

class ConnectPage {
  private readonly document: Document;
  private readonly bridge: ConnectBridge;
  private readonly store: AddressStore;
  private readonly input: HTMLInputElement;
  private readonly fieldError: HTMLElement;
  private readonly connectButton: HTMLButtonElement;
  private readonly startingStatus: HTMLElement;
  /** True while a hello call runs; presses are ignored, as the kit's busy Button does. */
  private busy = false;
  /** The button showing the busy state, so Change address can reset it. */
  private busyButton: HTMLButtonElement | undefined;
  /**
   * Counts hello calls and Change address presses. A call whose answer
   * comes after a newer one of these is out of date, and its answer is
   * dropped.
   */
  private attempt = 0;

  constructor(options: ConnectPageOptions) {
    this.document = options.document;
    this.bridge = options.bridge;
    this.store = options.store;
    this.input = this.find("#address");
    this.fieldError = this.find("#address-error");
    this.connectButton = this.find('[data-action="connect"]');
    this.startingStatus = this.find('[data-screen="starting"] [role="status"]');
    this.listen();
  }

  async start(changeAddress: boolean): Promise<void> {
    const remembered = this.store.load();
    if (remembered !== undefined) {
      this.input.value = remembered;
    }
    if (changeAddress || remembered === undefined) {
      this.showConnectScreen();
      return;
    }
    const sayConnecting = setTimeout(() => {
      this.startingStatus.textContent = words.connecting;
    }, quietStartMs);
    await this.connect("elsewhere");
    clearTimeout(sayConnecting);
  }

  private listen(): void {
    this.find("form").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.connect("connect-screen", this.connectButton);
    });
    this.input.addEventListener("input", () => this.clearFieldError());
    for (const button of this.findAll<HTMLButtonElement>('[data-action="try-again"]')) {
      button.addEventListener("click", () => void this.connect("elsewhere", button));
    }
    for (const button of this.findAll('[data-action="change-address"]')) {
      button.addEventListener("click", () => this.changeAddress());
    }
    this.find('[data-action="open-release-page"]').addEventListener("click", () => {
      // Like a failed hello call, a failed open never shows a raw error.
      this.bridge.openReleasePage().catch(() => undefined);
    });
  }

  /** Makes the hello call for the address in the field and shows its outcome. */
  private async connect(origin: Origin, button?: HTMLButtonElement): Promise<void> {
    if (this.busy) {
      return;
    }
    this.clearFieldError();
    const address = this.input.value.trim();
    this.attempt += 1;
    const attempt = this.attempt;
    this.setBusy(true, button);
    const result = await this.askShell(address);
    if (attempt !== this.attempt) {
      // Change address was pressed while the call ran: the user has moved
      // on, so a late answer must not take them off the connect screen.
      return;
    }
    if (result.kind === "connected") {
      // The window is about to leave this page, so it stays busy.
      this.store.save(address);
      this.bridge.openStudio(result.url);
      return;
    }
    this.setBusy(false, button);
    this.show(result, origin, address);
  }

  /** A failure inside the shell reads as "Can't reach": raw errors never show. */
  private async askShell(address: string): Promise<ConnectResult> {
    try {
      return await this.bridge.connect(address);
    } catch {
      return { kind: "notAnswering", address };
    }
  }

  private show(
    result: Exclude<ConnectResult, { kind: "connected" }>,
    origin: Origin,
    address: string,
  ): void {
    switch (result.kind) {
      case "notAnAddress":
        this.showFieldError(words.notAnAddress);
        return;
      case "notHomeNetwork":
        this.showFieldError(words.notHomeNetwork);
        return;
      case "notHalonic":
        this.showFieldError(words.notHalonic(result.address));
        return;
      case "notAnswering":
        if (origin === "connect-screen") {
          this.showFieldError(words.notAnswering(result.address));
        } else {
          this.showFullScreenMessage("not-answering");
        }
        return;
      case "appTooOld":
        this.store.save(address);
        this.showFullScreenMessage("app-too-old", words.appTooOld(result.computerVersion));
        return;
      case "computerTooOld":
        this.store.save(address);
        this.showFullScreenMessage(
          "computer-too-old",
          words.computerTooOld(result.computerVersion),
        );
        return;
    }
  }

  /** Change address: back to the connect screen, even while Try again is busy. */
  private changeAddress(): void {
    this.attempt += 1;
    this.setBusy(false, this.busyButton);
    this.showConnectScreen();
  }

  private showConnectScreen(): void {
    this.showScreen("connect");
    this.input.focus();
  }

  /**
   * Shows "isn't answering" or a version screen, with `message` when the
   * screen's words depend on a value. When the screen is new, focus goes to
   * its message first, then the primary button (flow 7.3).
   */
  private showFullScreenMessage(
    name: Exclude<ScreenName, "starting" | "connect">,
    message?: string,
  ): void {
    const { screen, changed } = this.showScreen(name);
    const messageElement = this.find(".message", screen);
    if (message !== undefined) {
      messageElement.textContent = message;
    }
    if (changed) {
      messageElement.focus();
    }
  }

  /**
   * Shows one screen and says whether it replaced another. Callers move the
   * focus only when it did: on the same screen again the focus stays where
   * it is, so a Try again that fails again keeps its focus. On a new screen
   * the pressed button is hidden, so the focus must move or it is lost.
   */
  private showScreen(name: ScreenName): { screen: HTMLElement; changed: boolean } {
    let shown: HTMLElement | undefined;
    let changed = false;
    for (const screen of this.findAll("[data-screen]")) {
      const isShown = screen.dataset["screen"] === name;
      if (isShown && screen.hidden) {
        changed = true;
      }
      screen.hidden = !isShown;
      if (isShown) {
        shown = screen;
      }
    }
    if (shown === undefined) {
      throw new Error(`connect.html has no "${name}" screen.`);
    }
    return { screen: shown, changed };
  }

  /**
   * A field error between the field and the hint, read out when it appears.
   * When it brings the connect screen back from another one, the focus goes
   * to the field, as on every other way into the connect screen.
   */
  private showFieldError(pieces: readonly Piece[]): void {
    const { changed } = this.showScreen("connect");
    if (changed) {
      this.input.focus();
    }
    this.fieldError.replaceChildren(...pieces.map((piece) => this.render(piece)));
    this.fieldError.hidden = false;
    this.input.setAttribute("aria-invalid", "true");
  }

  /** The error stays until the field changes or Connect is pressed again. */
  private clearFieldError(): void {
    this.fieldError.replaceChildren();
    this.fieldError.hidden = true;
    this.input.removeAttribute("aria-invalid");
  }

  private render(piece: Piece): Node {
    if (typeof piece === "string") {
      return this.document.createTextNode(piece);
    }
    // Each word in its own no-break run, so the command breaks only between
    // words (see `code .word` in connect.css), as in connect.html's hint.
    const code = this.document.createElement("code");
    piece.code.split(" ").forEach((word, index) => {
      if (index > 0) {
        code.append(" ");
      }
      const run = this.document.createElement("span");
      run.className = "word";
      run.textContent = word;
      code.append(run);
    });
    return code;
  }

  /** The kit's busy state: keeps focus, `aria-busy`, and Connect says "Connecting…". */
  private setBusy(busy: boolean, button: HTMLButtonElement | undefined): void {
    this.busy = busy;
    this.busyButton = busy ? button : undefined;
    if (button === undefined) {
      return;
    }
    button.setAttribute("aria-busy", String(busy));
    if (button === this.connectButton) {
      button.textContent = busy ? words.connecting : words.connect;
    }
  }

  private find<T extends HTMLElement>(selector: string, within: ParentNode = this.document): T {
    const element = within.querySelector<T>(selector);
    if (element === null) {
      throw new Error(`connect.html has no element for "${selector}".`);
    }
    return element;
  }

  private findAll<T extends HTMLElement>(selector: string): T[] {
    return [...this.document.querySelectorAll<T>(selector)];
  }
}
