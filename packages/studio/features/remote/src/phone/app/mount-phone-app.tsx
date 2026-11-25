import { PresentationProvider } from "@halonicjs/studio-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { OwnerCheckAvailable } from "../gateway-client.ts";
import type { NearbyComputers } from "../nearby-computers.ts";
import type { PhoneScanner } from "../pairing-flow.ts";
import type { PhoneTunnel } from "../phone-tunnel.ts";
import type { PhoneOutside } from "./computer-screen.tsx";
import { type ComputerTunnelOf, holdGateway } from "./held-gateway.ts";
import { PhoneApp } from "./phone-app.tsx";
import { PhoneAppRouter } from "./phone-app-router.ts";

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
  const root = createRoot(container);
  root.render(
    <StrictMode>
      {/* The kit's parts draw their phone forms: a stacked confirmation, full-width buttons. */}
      <PresentationProvider presentation="phone">
        <PhoneApp
          router={router}
          onOpenSettings={mount.onOpenSettings}
          onOpenTailscale={mount.onOpenTailscale}
          onCamera={mount.onCamera}
          nearby={mount.nearby}
        />
      </PresentationProvider>
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
