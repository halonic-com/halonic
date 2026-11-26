import { PresentationProvider } from "@halonicjs/studio-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { OwnerCheckAvailable } from "../gateway-client.ts";
import type { PhonePinning } from "../home-screen-group.tsx";
import type { NearbyComputers } from "../nearby-computers.ts";
import type { PhoneScanner } from "../pairing-flow.ts";
import type { ComputerId, PhoneTunnel } from "../phone-tunnel.ts";
import type { SavedDataStore } from "../saved-messaging.ts";
import type { PhoneOutside } from "./computer-screen.tsx";
import { type ComputerTunnelOf, holdGateway } from "./held-gateway.ts";
import { PhoneApp } from "./phone-app.tsx";
import { PhoneAppRouter } from "./phone-app-router.ts";
import type { ShortcutLanding, ShortcutTab } from "./shortcut-landing.ts";

/** The screen a shortcut asks for: a tab, or the last chat on its computer. */
export type ShortcutOpening =
  | { readonly screen: ShortcutTab }
  | { readonly screen: "chat"; readonly computer: string; readonly chat: string };

/** The Android app's shortcuts, as the phone app uses them (HAL-19143). */
export interface PhoneShortcuts extends PhonePinning {
  /** The screen the last shortcut asked for, once; undefined when none did. */
  readonly takeOpening: () => Promise<ShortcutOpening | undefined>;
  /** Makes a chat the phone opened the last-chat shortcut (HAL-20160). */
  readonly setLastChat: (chat: {
    readonly computer: string;
    readonly chat: string;
    readonly name: string;
  }) => void;
}

/** What the page hands the phone app. */
export interface PhoneAppMount extends PhoneOutside {
  readonly tunnel: PhoneTunnel;
  readonly scanner: PhoneScanner;
  /** The shell's list of computers on this Wi-Fi, for Type a code. Without it only paired ones show. */
  readonly nearby?: NearbyComputers;
  /** The page's window, for Android back (its history). */
  readonly window: Window;
  /**
   * True after the typed route's "Enter its address": the page shows its 0.1 connect screen in
   * place of the app. False when back comes to the app again.
   */
  readonly onAddress: (showing: boolean) => void;
  readonly onCamera: (showing: boolean) => void;
  /**
   * The shell's tunnel to one paired computer: each computer's screen shows its agents through a
   * gateway client over it. Without it the screens show the connection only.
   */
  readonly computerTunnel?: ComputerTunnelOf;
  /**
   * The shell's `owner_check_available`. Without it, `risky` approvals are
   * answered on the computer only.
   */
  readonly ownerCheckAvailable?: OwnerCheckAvailable;
  /** The shell's store of each computer's saved Inbox and Messenger. Without it nothing is saved. */
  readonly saved?: SavedDataStore;
  /** Where a call the shell refused goes, for the log. */
  readonly report: (problem: string) => void;
  /** The Android app's shortcuts; without them the app opens as its icon does. */
  readonly shortcuts?: PhoneShortcuts;
}

/**
 * Draws the phone app into `container` and starts it (task D5, HAL-15985). Android back goes
 * through the page's history: while the app has somewhere to go back to, one history entry stands
 * for it, so back comes to the app instead of closing it. The container is hidden while the page
 * shows its 0.1 connect screen. A shortcut's tab is taken before the start, and again each time
 * the page shows, since a shortcut tapped while the app runs comes back to this page (HAL-19143).
 * Returns the unmount.
 */
export function mountPhoneApp(container: HTMLElement, mount: PhoneAppMount): () => void {
  const router = new PhoneAppRouter({
    tunnel: mount.tunnel,
    scanner: mount.scanner,
    report: mount.report,
    ...(mount.saved === undefined ? {} : { saved: mount.saved }),
    ...(mount.shortcuts === undefined ? {} : { lastChat: mount.shortcuts.setLastChat }),
    ...(mount.computerTunnel === undefined
      ? {}
      : {
          hold: holdGateway(mount.computerTunnel, mount.window.document, mount.ownerCheckAvailable),
        }),
  });
  const history = mount.window.history;
  let standing = false;
  let leaving = false;
  let address = false;
  const follow = () => {
    const { screen, canGoBack } = router.view;
    if ((screen.screen === "address") !== address) {
      address = !address;
      container.hidden = address;
      mount.onAddress(address);
    }
    if (canGoBack && !standing) {
      history.pushState({ phoneApp: true }, "");
      standing = true;
    } else if (!canGoBack && standing) {
      // The app went back by itself (a Back button, Paired): take the entry away again.
      standing = false;
      leaving = true;
      history.back();
    }
  };
  const onPopState = () => {
    if (leaving) {
      leaving = false;
      return;
    }
    standing = false;
    router.back();
    follow();
  };
  const unsubscribe = router.subscribe(follow);
  mount.window.addEventListener("popstate", onPopState);
  const { shortcuts } = mount;
  const page = mount.window.document;
  const onShown = () => {
    if (shortcuts === undefined || page.visibilityState !== "visible") return;
    shortcuts.takeOpening().then(
      (opening) => {
        if (opening !== undefined) router.openShortcut(landingOf(opening));
      },
      (error: unknown) => mount.report(`The shortcut's screen couldn't be read: ${String(error)}`),
    );
  };
  page.addEventListener("visibilitychange", onShown);
  const root = createRoot(container);
  root.render(
    <StrictMode>
      {/* The kit's parts draw their phone forms: a stacked confirmation, full-width buttons. */}
      <PresentationProvider presentation="phone">
        <PhoneApp
          router={router}
          onOpenSettings={mount.onOpenSettings}
          onOpenTailscale={mount.onOpenTailscale}
          onOpenLink={mount.onOpenLink}
          onCamera={mount.onCamera}
          nearby={mount.nearby}
          pinning={shortcuts}
          report={mount.report}
        />
      </PresentationProvider>
    </StrictMode>,
  );
  void startOn(router, shortcuts, mount.report);
  return () => {
    unsubscribe();
    mount.window.removeEventListener("popstate", onPopState);
    page.removeEventListener("visibilitychange", onShown);
    root.unmount();
    router.dispose();
  };
}

/** Starts the app on the tab the shortcut that opened it asked for, if one did. */
async function startOn(
  router: PhoneAppRouter,
  shortcuts: PhoneShortcuts | undefined,
  report: (problem: string) => void,
): Promise<void> {
  const opening = await shortcuts?.takeOpening().catch((error: unknown) => {
    report(`The shortcut's screen couldn't be read: ${String(error)}`);
    return undefined;
  });
  await router.start(opening === undefined ? undefined : landingOf(opening));
}

/** Where a shortcut's screen lands. The shell checked the chat's computer id before it answered. */
function landingOf(opening: ShortcutOpening): ShortcutLanding {
  if (opening.screen !== "chat") return opening.screen;
  return { computer: opening.computer as ComputerId, chat: opening.chat };
}
