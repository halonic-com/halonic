import type {
  ComputerTunnelOf,
  mountPhoneApp,
  NearbyComputers,
  OwnerCheckAvailable,
  PhoneTunnel,
  SavedDataStore,
} from "@halonicjs/studio-feature-remote/phone";
import { type ConnectPageOptions, startConnectPage } from "./connect-page.ts";
import type { PairingScanner } from "./pair-scan.ts";
import type { AppShortcuts } from "./tauri-app-shortcuts.ts";

/** The phone app's code, loaded only when the shell has a tunnel. */
export type PhoneAppModule = { readonly mountPhoneApp: typeof mountPhoneApp };

export interface PageOptions extends ConnectPageOptions {
  /** The shell's phone tunnel; without one the page is the 0.1 connect page. */
  readonly tunnel: PhoneTunnel | undefined;
  /** The shell's tunnel to one paired computer, which its agents come through. */
  readonly computerTunnel?: ComputerTunnelOf;
  /** The shell's `owner_check_available`; without it `risky` approvals stay on the computer. */
  readonly ownerCheckAvailable?: OwnerCheckAvailable;
  /** The shell's store of each computer's saved Inbox and Messenger. */
  readonly saved?: SavedDataStore;
  readonly scanner: PairingScanner;
  /** The shell's list of computers on this Wi-Fi, for the typed route's picker. */
  readonly nearby?: NearbyComputers;
  readonly window: Window;
  /** Android's settings for Halonic. */
  readonly openSettings: () => void;
  readonly openTailscale: () => void;
  /** A message's link in the system browser. */
  readonly openLink: (link: string) => void;
  /** Where an answer or a refusal the page doesn't expect goes, for the log. */
  readonly report: (problem: string) => void;
  /** The Android app's shortcuts (HAL-19143); without them no shortcut opens a screen. */
  readonly shortcuts?: AppShortcuts;
  /** Loads the phone app; a test passes its own. */
  readonly loadPhoneApp?: () => Promise<PhoneAppModule>;
}

const loadPhoneApp = async (): Promise<PhoneAppModule> => {
  const [phoneApp] = await Promise.all([
    import("@halonicjs/studio-feature-remote/phone"),
    import("./phone-app.css"),
  ]);
  return phoneApp;
};

/**
 * Starts the Android app's own page (HAL-15985). Without a tunnel it's the 0.1 connect page and
 * nothing else loads. With one, the launch rule decided on HAL-16439 picks the page, checked on
 * every launch and never saved:
 * - `#change-address` and `#page-not-shown` open the connect screen, as the 0.1 page does;
 * - a remembered address and no paired computer keep the 0.1 launch, which connects to it;
 * - anything else opens the phone app: Pair with a computer, or the paired computer's screen.
 * A shortcut's screen counts only in the phone app; the 0.1 launch drops it.
 * In the phone app the connect screen shows only after "Not listed? Enter its address", filled in.
 */
export async function startPage(options: PageOptions): Promise<void> {
  const { document, tunnel } = options;
  if (tunnel === undefined || options.changeAddress) return startConnectPage(options);
  if (options.store.load() !== undefined && !(await anyPaired(tunnel, options.report))) {
    // The Studio the 0.1 launch opens has no address for a screen, so a shortcut opens it as the
    // icon does (decided on HAL-19148). Its screen is taken all the same, so it can't turn up later.
    await options.shortcuts?.takeOpening();
    return startConnectPage(options);
  }
  const section = document.createElement("section");
  section.dataset["screen"] = "tunnel";
  const main = document.querySelector("main");
  if (main === null) throw new Error("connect.html has no <main>.");
  main.append(section);
  showOnly(document, "tunnel");
  const phoneApp = await (options.loadPhoneApp ?? loadPhoneApp)();
  let connectStarted = false;
  phoneApp.mountPhoneApp(section, {
    tunnel,
    ...(options.computerTunnel === undefined ? {} : { computerTunnel: options.computerTunnel }),
    ...(options.ownerCheckAvailable === undefined
      ? {}
      : { ownerCheckAvailable: options.ownerCheckAvailable }),
    ...(options.saved === undefined ? {} : { saved: options.saved }),
    ...(options.shortcuts === undefined ? {} : { shortcuts: options.shortcuts }),
    scanner: options.scanner,
    ...(options.nearby === undefined ? {} : { nearby: options.nearby }),
    window: options.window,
    report: options.report,
    onOpenSettings: options.openSettings,
    onOpenTailscale: options.openTailscale,
    onOpenLink: options.openLink,
    // The camera runs behind the web view: the page lets it show through while scanning.
    onCamera: (showing) => document.body.classList.toggle("camera", showing),
    onAddress: (showing) => {
      if (!showing) return showOnly(document, "tunnel");
      if (connectStarted) return showOnly(document, "connect");
      connectStarted = true;
      void startConnectPage({ ...options, changeAddress: true, pageNotShown: false });
    },
  });
}

/**
 * Whether the phone has a paired computer. When the list can't be read (the phone's key storage
 * doesn't work, or the shell refused), the answer is no: the remembered address needs no keys.
 */
async function anyPaired(tunnel: PhoneTunnel, report: (problem: string) => void): Promise<boolean> {
  try {
    const listed = await tunnel.pairedComputers();
    return "length" in listed && listed.length > 0;
  } catch (error) {
    report(`The paired computers couldn't be read at launch: ${String(error)}`);
    return false;
  }
}

/** Shows one of connect.html's screens and hides the others. */
function showOnly(document: Document, name: string): void {
  for (const screen of document.querySelectorAll<HTMLElement>("[data-screen]")) {
    screen.hidden = screen.dataset["screen"] !== name;
  }
}
