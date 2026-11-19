// @vitest-environment jsdom

import type { Plugin } from "@halonicjs/format";
import { type ExternalAddress, OpenExternalProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginSettingsReader } from "../settings/plugin-settings-section.tsx";
import { acmeWithSignIn, noSettings, weather } from "../test-support/plugins.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import {
  type PluginSignInStatus,
  type PluginSignIns,
  PluginSignInsSection,
  type PluginSignOutResult,
} from "./plugin-sign-ins-section.tsx";

afterEach(unmountAll);

const authorizeUrl = "https://auth.example.com/oauth/authorize?client_id=abc123";

/**
 * The host's sign-ins as a test sets them, with every call written down, and
 * the pages the browser opened.
 */
class FakeSignIns implements PluginSignIns {
  readonly calls: string[] = [];
  readonly opened: string[] = [];
  statuses: PluginSignInStatus[] = [{ signIn: "account", state: "signedOut" }];
  startAnswer = authorizeUrl;
  startError: unknown;
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

async function show(
  signIns: FakeSignIns,
  options: {
    readonly plugin?: Plugin;
    readonly values?: Record<string, string>;
    readonly off?: { readonly reason: string };
    readonly viewOnly?: boolean;
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
      />
    </OpenExternalProvider>,
  );
  await act(async () => {});
  return view;
}

function button(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.startsWith(name),
  );
}

async function press(name: string) {
  const found = button(name);
  if (found === undefined) throw new Error(`No button ${name}`);
  await act(async () => found.click());
}

verifies("plugins.plugin-sign-ins", () => {
  describe("signed out", () => {
    it("shows the purpose, the trust check line and Sign in", async () => {
      const view = await show(new FakeSignIns());

      expect(view.querySelector("h2")?.textContent).toBe("Sign-ins");
      expect(view.textContent).toContain("Access to your Acme account.");
      expect(view.textContent).toContain(
        "Signs in to your acme account at auth.example.com. Halonic gets the tokens from auth.example.com.",
      );
      expect(button("Sign in")).toBeDefined();
    });

    it("starts the sign-in and opens its address in the browser", async () => {
      const signIns = new FakeSignIns();
      await show(signIns);

      await press("Sign in");

      expect(signIns.calls).toContain("start acme account");
      expect(signIns.opened).toEqual([authorizeUrl]);
    });

    it("reads where the sign-ins stand again when the person comes back to the window", async () => {
      const signIns = new FakeSignIns();
      const view = await show(signIns);
      signIns.statuses = [{ signIn: "account", state: "signedIn" }];

      await act(async () => window.dispatchEvent(new Event("focus")));

      expect(view.textContent).toContain("Signed in");
      expect(button("Sign out")).toBeDefined();
    });

    it("says why a sign-in couldn't start when the client secret isn't set", async () => {
      const signIns = new FakeSignIns();
      signIns.startError = Object.assign(new Error("not set"), { kind: "client_secret_missing" });
      const view = await show(signIns);

      await press("Sign in");

      expect(signIns.opened).toEqual([]);
      expect(view.querySelector('[role="status"]')?.textContent).toBe(
        "The client secret isn't set. Set it in Settings.",
      );
    });

    it("shows how the last sign-in ended", async () => {
      const signIns = new FakeSignIns();
      signIns.statuses = [
        { signIn: "account", state: "signedOut", lastOutcome: { kind: "cancelled" } },
      ];
      const view = await show(signIns);

      expect(view.querySelector('[role="status"]')?.textContent).toBe("You cancelled the sign-in.");
    });
  });

  describe("signed in", () => {
    it("signs out and reads the state again", async () => {
      const signIns = new FakeSignIns();
      signIns.statuses = [{ signIn: "account", state: "signedIn" }];
      await show(signIns);

      await press("Sign out");

      expect(signIns.calls).toContain("signOut acme account");
      expect(button("Sign in")).toBeDefined();
    });

    it("says the token may still work when the provider didn't confirm", async () => {
      const signIns = new FakeSignIns();
      signIns.statuses = [{ signIn: "account", state: "signedIn" }];
      signIns.signOutResult = { kind: "signedOut", revoke: "notConfirmed" };
      const view = await show(signIns);

      await press("Sign out");

      expect(view.querySelector('[role="status"]')?.textContent).toBe(
        "You're signed out here. acme didn't confirm, so the token may still work there until it expires.",
      );
    });
  });

  it("offers Sign in again with the reason when the sign-in changed", async () => {
    const signIns = new FakeSignIns();
    signIns.statuses = [{ signIn: "account", state: "approvalChanged" }];
    const view = await show(signIns);

    expect(view.textContent).toContain("This integration's sign-in changed since you approved it.");
    await press("Sign in again");
    expect(signIns.opened).toEqual([authorizeUrl]);
  });

  it("warns when the token address is another service", async () => {
    const view = await show(new FakeSignIns(), {
      plugin: acmeWithSignIn("https://tokens.example.net/token"),
    });

    expect(view.textContent).toContain(
      "The sign-in page and the token address are different services: auth.example.com and tokens.example.net.",
    );
  });

  it("asks for the settings first when the client ID isn't set, with no button", async () => {
    const view = await show(new FakeSignIns(), { values: {} });

    expect(view.textContent).toContain("Access to your Acme account.");
    expect(view.textContent).toContain("Fill in this sign-in's settings first.");
    expect(view.textContent).not.toContain("Signs in to your");
    expect(button("Sign in")).toBeUndefined();
  });

  it("shows what a sign-in does but no buttons and no state while the plugin is off", async () => {
    const signIns = new FakeSignIns();
    const view = await show(signIns, { off: { reason: "status" } });

    expect(view.textContent).toContain("Signs in to your acme account");
    expect(button("Sign in")).toBeUndefined();
    expect(signIns.calls).toEqual([]);
  });

  it("has no buttons when the page is view only", async () => {
    const signIns = new FakeSignIns();
    signIns.statuses = [{ signIn: "account", state: "signedIn" }];
    const view = await show(signIns, { viewOnly: true });

    expect(view.textContent).toContain("Signed in");
    expect(button("Sign out")).toBeUndefined();
  });

  it("shows nothing for a plugin without sign-ins", async () => {
    const signIns = new FakeSignIns();
    const manifest = weather().manifest;
    if (manifest === undefined) throw new Error("no manifest");
    const view = await show(signIns, { plugin: manifest });

    expect(view.textContent).toBe("");
    expect(signIns.calls).toEqual([]);
  });

  it("says when where the sign-ins stand couldn't be read", async () => {
    const signIns = new FakeSignIns();
    signIns.status = async () => {
      throw new Error("The agent host isn't running.");
    };
    const view = await show(signIns);

    expect(view.textContent).toContain("Couldn't load acme's sign-ins:");
  });
});

verifies("plugins.plugin-sign-in-page", () => {
  it("opens the address the host answers on the approved host", async () => {
    const signIns = new FakeSignIns();
    signIns.statuses = [{ signIn: "account", state: "approvalChanged" }];
    await show(signIns);

    await press("Sign in again");

    expect(signIns.opened).toEqual([authorizeUrl]);
  });

  it.each([
    ["another host", "https://evil.example.net/oauth/authorize?client_id=abc123"],
    ["the approved host over http", "http://auth.example.com/oauth/authorize?client_id=abc123"],
    ["the approved host on another port", "https://auth.example.com:8443/oauth/authorize"],
    ["the approved host as a user name", "https://auth.example.com@evil.example.net/oauth"],
    ["no address", "auth.example.com/oauth/authorize"],
  ])("opens nothing when the host answers %s, and names the approved host", async (_, answer) => {
    const signIns = new FakeSignIns();
    signIns.startAnswer = answer;
    const view = await show(signIns);

    await press("Sign in");

    expect(signIns.opened).toEqual([]);
    expect(view.querySelector('[role="status"]')?.textContent).toBe(
      "Couldn't start the sign-in: the page to open isn't on auth.example.com.",
    );
  });
});
