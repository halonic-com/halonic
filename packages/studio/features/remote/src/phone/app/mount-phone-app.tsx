import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { PhoneScanner } from "../pairing-flow.ts";
import type { PairedComputer, PhoneTunnel } from "../phone-tunnel.ts";
import type { PhoneOutside } from "./computer-screen.tsx";
import { PhoneApp } from "./phone-app.tsx";
import { type HeldComputer, PhoneAppRouter } from "./phone-app-router.ts";

/** What the page hands the phone app. */
export interface PhoneAppMount extends PhoneOutside {
  readonly tunnel: PhoneTunnel;
  readonly scanner: PhoneScanner;
  /** The page's window, for Android back (its history). */
  readonly window: Window;
  /**
   * True after the typed route's "Enter its address": the page shows its 0.1 connect screen in
   * place of the app. False when back comes to the app again.
   */
  readonly onAddress: (showing: boolean) => void;
  readonly onCamera: (showing: boolean) => void;
  /** What the page holds from a computer it shows; dropped when it removes this phone. */
  readonly hold?: (computer: PairedComputer) => HeldComputer;
  /** Where a call the shell refused goes, for the log. */
  readonly report: (problem: string) => void;
}

/**
 * Draws the phone app into `container` and starts it (task D5, HAL-15985). Android back goes
 * through the page's history: while the app has somewhere to go back to, one history entry stands
 * for it, so back comes to the app instead of closing it. The container is hidden while the page
 * shows its 0.1 connect screen. Returns the unmount.
 */
export function mountPhoneApp(container: HTMLElement, mount: PhoneAppMount): () => void {
  const router = new PhoneAppRouter({
    tunnel: mount.tunnel,
    scanner: mount.scanner,
    report: mount.report,
    ...(mount.hold === undefined ? {} : { hold: mount.hold }),
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
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <PhoneApp
        router={router}
        onOpenSettings={mount.onOpenSettings}
        onOpenTailscale={mount.onOpenTailscale}
        onCamera={mount.onCamera}
      />
    </StrictMode>,
  );
  void router.start();
  return () => {
    unsubscribe();
    mount.window.removeEventListener("popstate", onPopState);
    root.unmount();
    router.dispose();
  };
}
