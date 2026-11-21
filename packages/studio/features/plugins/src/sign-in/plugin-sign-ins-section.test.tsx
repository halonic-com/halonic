// @vitest-environment jsdom

import type { Plugin } from "@halonicjs/format";
import { type ExternalAddress, OpenExternalProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/** Answers from the host that aren't the approved sign-in page, each with what is wrong with it. */
const wrongPages = [
  ["another host", "https://evil.example.net/oauth/authorize?client_id=abc123"],
  ["the approved host over http", "http://auth.example.com/oauth/authorize?client_id=abc123"],
  ["the approved host on another port", "https://auth.example.com:8443/oauth/authorize"],
  ["the approved host as a user name", "https://auth.example.com@evil.example.net/oauth"],
  ["no address", "auth.example.com/oauth/authorize"],
] as const;

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

async function show(
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

/** The person comes back to the window, and the section reads where the sign-ins stand again. */
async function comeBack() {
  await act(async () => window.dispatchEvent(new Event("focus")));
}

const waitingLine = "Waiting for acme… Finish in your browser.";

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
      expect(view.textContent).toContain("The client secret is missing. Add it in Settings.");
    });

    it("shows how the last sign-in ended", async () => {
      const signIns = new FakeSignIns();
      signIns.statuses = [
        { signIn: "account", state: "signedOut", lastOutcome: { kind: "cancelled" } },
      ];
      const view = await show(signIns);

      expect(view.textContent).toContain("You cancelled the sign-in.");
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

      expect(view.textContent).toContain(
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
    expect(view.textContent).toContain(
      "This sign-in needs a setting that's missing or not valid. Check Settings.",
    );
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

    expect(view.querySelector(".text-body-strong")?.textContent).toBe(
      "Couldn't load acme's sign-ins",
    );
    expect(view.textContent).toContain("Halonic ran into a problem it can't explain yet.");
  });

  it("says once, not twice, that the sign-in changed", async () => {
    const signIns = new FakeSignIns();
    signIns.statuses = [
      { signIn: "account", state: "approvalChanged", lastOutcome: { kind: "signInChanged" } },
    ];
    const view = await show(signIns);

    const said = view.textContent?.split(
      "This integration's sign-in changed since you approved it.",
    );
    expect(said).toHaveLength(2);
  });
});

verifies("plugins.plugin-sign-in-announced", () => {
  it("reads a new line under a sign-in once through the window's announcer", async () => {
    const signIns = new FakeSignIns();
    signIns.startError = Object.assign(new Error("not set"), { kind: "client_secret_missing" });
    const announced: string[] = [];
    await show(signIns, { announced });

    await press("Sign in");

    expect(announced).toEqual([
      "sign-in:acme:account: The client secret is missing. Add it in Settings.",
    ]);
  });

  it("reads how a sign-in ended when the person comes back to the window", async () => {
    const signIns = new FakeSignIns();
    const announced: string[] = [];
    await show(signIns, { announced });
    signIns.statuses = [
      { signIn: "account", state: "signedOut", lastOutcome: { kind: "cancelled" } },
    ];

    await act(async () => window.dispatchEvent(new Event("focus")));

    expect(announced).toEqual(["sign-in:acme:account: You cancelled the sign-in."]);
  });

  it("doesn't read the line already there when the page opens", async () => {
    const signIns = new FakeSignIns();
    signIns.statuses = [
      { signIn: "account", state: "signedOut", lastOutcome: { kind: "cancelled" } },
    ];
    const announced: string[] = [];
    const view = await show(signIns, { announced });

    expect(view.textContent).toContain("You cancelled the sign-in.");
    expect(announced).toEqual([]);
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

  it.each(wrongPages)(
    "opens nothing when the host answers %s, and names the approved host",
    async (_, answer) => {
      const signIns = new FakeSignIns();
      signIns.startAnswer = answer;
      const view = await show(signIns);

      await press("Sign in");

      expect(signIns.opened).toEqual([]);
      expect(view.textContent).toContain(
        "Couldn't start the sign-in: the page to open isn't on auth.example.com.",
      );
    },
  );

  // Studio's oldest webviews (WebKitGTK 2.44, Chromium 123) have no `URL.parse` (HAL-13797).
  describe("without URL.parse", () => {
    // jsdom's `URL` inherits `parse`, so it is hidden behind an own `undefined` rather than deleted.
    let parse: PropertyDescriptor | undefined;
    beforeEach(() => {
      parse = Object.getOwnPropertyDescriptor(URL, "parse");
      Object.defineProperty(URL, "parse", { value: undefined, configurable: true });
    });
    afterEach(() => {
      if (parse === undefined) Reflect.deleteProperty(URL, "parse");
      else Object.defineProperty(URL, "parse", parse);
    });

    it("opens the address the host answers on the approved host", async () => {
      expect(URL.parse).toBeUndefined();
      const signIns = new FakeSignIns();
      await show(signIns);

      await press("Sign in");

      expect(signIns.opened).toEqual([authorizeUrl]);
    });

    it.each(wrongPages)("opens nothing when the host answers %s", async (_, answer) => {
      const signIns = new FakeSignIns();
      signIns.startAnswer = answer;
      await show(signIns);

      await press("Sign in");

      expect(signIns.opened).toEqual([]);
    });
  });
});

verifies("plugins.plugin-sign-in-waiting", () => {
  it("waits for the browser with Cancel in place of Sign in", async () => {
    const view = await show(new FakeSignIns());

    await press("Sign in");

    expect(view.textContent).toContain(waitingLine);
    expect(button("Cancel")).toBeDefined();
    expect(button("Sign in")).toBeUndefined();
  });

  it("keeps waiting when the person comes back before the browser finished", async () => {
    const view = await show(new FakeSignIns());
    await press("Sign in");

    await comeBack();

    expect(view.textContent).toContain(waitingLine);
  });

  it("ends the wait when the sign-in finished in the browser", async () => {
    const signIns = new FakeSignIns();
    const view = await show(signIns);
    await press("Sign in");
    signIns.statuses = [{ signIn: "account", state: "signedIn" }];

    await comeBack();

    expect(view.textContent).not.toContain(waitingLine);
    expect(view.textContent).toContain("Signed in");
    expect(button("Sign out")).toBeDefined();
  });

  it("ends the wait and says how when the sign-in ended without a grant", async () => {
    const signIns = new FakeSignIns();
    const view = await show(signIns);
    await press("Sign in");
    signIns.statuses = [
      {
        signIn: "account",
        state: "signedOut",
        lastOutcome: { kind: "providerError", errorCode: "access_denied" },
      },
    ];

    await comeBack();

    expect(view.textContent).not.toContain(waitingLine);
    expect(view.textContent).toContain("acme answered with the error access_denied.");
    expect(button("Sign in")).toBeDefined();
  });

  it("hides how the last sign-in ended while it waits for a new one", async () => {
    const signIns = new FakeSignIns();
    signIns.statuses = [
      { signIn: "account", state: "signedOut", lastOutcome: { kind: "cancelled" } },
    ];
    const view = await show(signIns);

    await press("Sign in");

    expect(view.textContent).not.toContain("You cancelled the sign-in.");
  });

  it("cancels the pending sign-in at the host and offers Sign in again, with focus on it", async () => {
    const signIns = new FakeSignIns();
    const view = await show(signIns);
    await press("Sign in");
    button("Cancel")?.focus();

    await press("Cancel");

    expect(signIns.calls).toContain("cancel acme account");
    expect(view.textContent).not.toContain(waitingLine);
    expect(document.activeElement).toBe(button("Sign in"));
  });

  it("keeps waiting and says why when Cancel fails", async () => {
    const signIns = new FakeSignIns();
    signIns.cancelError = new Error("The agent host isn't running.");
    const view = await show(signIns);
    await press("Sign in");

    await press("Cancel");

    expect(view.textContent).toContain(waitingLine);
    expect(view.textContent).toContain("Couldn't cancel the sign-in:");
  });

  it("stops waiting when the host no longer takes the browser's answer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const view = await show(new FakeSignIns());
      await press("Sign in");

      await act(async () => vi.advanceTimersByTime(10 * 60 * 1000));

      expect(view.textContent).not.toContain(waitingLine);
      expect(view.textContent).toContain("The sign-in didn't finish. Try again.");
      expect(button("Sign in")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't wait when the browser didn't open", async () => {
    const signIns = new FakeSignIns();
    signIns.startAnswer = "https://evil.example.net/oauth/authorize";
    const view = await show(signIns);

    await press("Sign in");

    expect(view.textContent).not.toContain(waitingLine);
    expect(button("Sign in")).toBeDefined();
  });

  it("reads the waiting line once through the window's announcer", async () => {
    const announced: string[] = [];
    await show(new FakeSignIns(), { announced });

    await press("Sign in");

    expect(announced).toEqual([`sign-in:acme:account: ${waitingLine}`]);
  });
});
