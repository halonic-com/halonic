/**
 * The sign-ins section's tests share these: a fake of the host's sign-ins, a way to show the
 * section with it, and the person's moves (pressing a button, coming back to the window).
 */
import type { Plugin } from "@halonicjs/format";
import { type ExternalAddress, OpenExternalProvider } from "@halonicjs/studio-kit";
import { act } from "react";
import type { PluginSettingsReader } from "../settings/plugin-settings-section.tsx";
import {
  type PluginSignInStatus,
  type PluginSignIns,
  PluginSignInsSection,
  type PluginSignOutResult,
} from "../sign-in/plugin-sign-ins-section.tsx";
import { acmeWithSignIn, noSettings } from "./plugins.ts";
import { render } from "./render.tsx";

export const authorizeUrl = "https://auth.example.com/oauth/authorize?client_id=abc123";

/**
 * The host's sign-ins as a test sets them, with every call written down, and
 * the pages the browser opened.
 */
export class FakeSignIns implements PluginSignIns {
  readonly calls: string[] = [];
  readonly opened: string[] = [];
  statuses: PluginSignInStatus[] = [{ signIn: "account", state: "signedOut" }];
  startAnswer = authorizeUrl;
  startError: unknown;
  cancelError: unknown;
  signOutResult: PluginSignOutResult = { kind: "signedOut", revoke: "revoked" };

  async status(plugin: string) {
    this.calls.push(`status ${plugin}`);
    return this.statuses;
  }
  async start(plugin: string, signIn: string) {
    this.calls.push(`start ${plugin} ${signIn}`);
    if (this.startError !== undefined) throw this.startError;
    return this.startAnswer;
  }
  async cancel(plugin: string, signIn: string) {
    this.calls.push(`cancel ${plugin} ${signIn}`);
    if (this.cancelError !== undefined) throw this.cancelError;
  }
  async signOut(plugin: string, signIn: string) {
    this.calls.push(`signOut ${plugin} ${signIn}`);
    this.statuses = [{ signIn: "account", state: "signedOut" }];
    return this.signOutResult;
  }
  /** The kit's `openExternal`, as the shell gives it: it opens the address once it arrives. */
  readonly openExternal = async (address: ExternalAddress) => {
    this.opened.push(await address);
  };
}

/** Settings with the client ID set, unless the test leaves it out. */
function settingsWith(values: Record<string, string>): PluginSettingsReader {
  return { ...noSettings().settings, settings: async () => values };
}

export async function show(
  signIns: FakeSignIns,
  options: {
    readonly plugin?: Plugin;
    readonly values?: Record<string, string>;
    readonly off?: { readonly reason: string };
    readonly viewOnly?: boolean;
    readonly announced?: string[];
  } = {},
) {
  const view = render(
    <OpenExternalProvider openExternal={signIns.openExternal}>
      <PluginSignInsSection
        plugin={options.plugin ?? acmeWithSignIn()}
        settings={settingsWith(options.values ?? { clientId: "abc123" })}
        signIns={signIns}
        off={options.off}
        viewOnly={options.viewOnly ?? false}
        announceState={(key, text) => options.announced?.push(`${key}: ${text}`)}
      />
    </OpenExternalProvider>,
  );
  await act(async () => {});
  return view;
}

export function button(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.startsWith(name),
  );
}

export async function press(name: string) {
  const found = button(name);
  if (found === undefined) throw new Error(`No button ${name}`);
  await act(async () => found.click());
}

/** The person comes back to the window, and the section reads where the sign-ins stand again. */
export async function comeBack() {
  await act(async () => window.dispatchEvent(new Event("focus")));
}
