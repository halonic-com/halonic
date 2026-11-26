import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "./fake-studio.test-helper.ts";
import type { StepContext } from "./runner.ts";
import { addAccount } from "./steps/add-account.ts";
import {
  accountSwitcher,
  connectionRow,
  httpsOnly,
  menuRowNamed,
  plainHttpAddress,
  rowDisconnect,
  switcherTrigger,
} from "./steps/connections.ts";
import { clickTestSteps } from "./steps.ts";
import { buttonLabels, screenText, words } from "./words.ts";

const userLabel = "Paperclip · Acme Click Test · Board";

/** One connection's row, as Settings › Connections reads it. */
function row(label: string): string {
  return `${label}\n${words.readOnly}\n${words.connected}\n${words.addAccount}\n${words.disconnect}\n${words.keyPower}`;
}

/** A Studio on a workspace whose Settings › Connections lists `rows`. */
function studioWithConnections(rows: string[]): FakeStudio {
  const studio = fakeStudio("Acme");
  const show = () => {
    setText(studio, `${words.connectionsSection}\n${rows.join("\n")}\n${words.connect}`);
  };
  button(studio, "main", buttonLabels.settings.text, show);
  button(studio, "main", words.connectionsSection, show);
  // Escape closes whatever an earlier step left open; the fake has nothing open.
  button(studio, "main", "\uE00C");
  return studio;
}

function setText(studio: FakeStudio, text: string) {
  const window = studio.windows.get("main");
  if (window !== undefined) window.text = text;
}

/** Adds the Connect dialog, whose Continue shows `afterContinue`. */
function withConnectDialog(studio: FakeStudio, afterContinue: string) {
  button(studio, "main", words.connect, () => {
    button(studio, "main", words.continueLabel, () => setText(studio, afterContinue));
    button(studio, "main", `Close ${words.connect}`, () => setText(studio, row(userLabel)));
  });
}

verifies("studio-click-test.connections-steps", () => {
  it("come straight after Connect Paperclip, so no restart signs its connection out first", () => {
    // Run 45721379968: after the basics failed, the restart left step 3's connection signed out.
    expect(clickTestSteps.slice(2, 7).map((step) => step.id)).toEqual([
      "connect-paperclip",
      "account-switcher",
      "connection-row",
      "connect-https-only",
      "add-account",
    ]);
  });

  describe("the account switcher", () => {
    it("opens its menu, then Settings › Connections with the row", async () => {
      const studio = studioWithConnections([row(userLabel)]);
      const { lead, settings } = words.switcher;
      button(studio, "main", switcherTrigger, () => {
        setText(studio, `${lead}\nBoard\n${settings}`);
        button(studio, "main", settings, () => setText(studio, row(userLabel)));
      });
      await expect(accountSwitcher.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toEqual(["\uE00C", switcherTrigger, settings]);
    });

    it("looks behind ☰ Places, and fails as NO_SWITCHER when it isn't there either", async () => {
      const studio = studioWithConnections([row(userLabel)]);
      button(studio, "main", screenText.places.text);
      const outcome = await accountSwitcher.run(studio.context);
      expect(outcome).toMatchObject({ passed: false, code: "NO_SWITCHER" });
      expect(studio.clicks).toContain(screenText.places.text);
    });

    it("clicks a menu row by its role and text", () => {
      expect(menuRowNamed("Settings › Connections")).toContain("@role='menuitem'");
      expect(menuRowNamed("Settings › Connections")).toContain(
        "normalize-space()='Settings › Connections'",
      );
    });
  });

  describe("the connection row", () => {
    it("passes for a connected row named after its user, and notes the label", async () => {
      const outcome = await connectionRow.run(studioWithConnections([row(userLabel)]).context);
      expect(outcome).toEqual({ passed: true, note: userLabel });
    });

    // Run 45705906639: step 4 left the Settings dialog open, where neither Places nor Settings is.
    it("passes when an earlier step left Settings open on another section", async () => {
      const studio = fakeStudio("Settings\nModels\nConnections");
      button(studio, "main", words.connectionsSection, () => setText(studio, row(userLabel)));
      const outcome = await connectionRow.run(studio.context);
      expect(outcome).toEqual({ passed: true, note: userLabel });
      expect(studio.clicks).toEqual([words.connectionsSection]);
    });

    it("fails as NO_USER_NAME when the label names no user", async () => {
      const studio = studioWithConnections([row("Paperclip · Acme Click Test")]);
      await expect(connectionRow.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "NO_USER_NAME",
      });
    });

    it("fails as NO_ROW when the section lists nothing", async () => {
      await expect(connectionRow.run(studioWithConnections([]).context)).resolves.toMatchObject({
        passed: false,
        code: "NO_ROW",
      });
    });
  });

  describe("https only", () => {
    it("passes when the field refuses the plain http address and the dialog closes", async () => {
      const studio = studioWithConnections([row(userLabel)]);
      withConnectDialog(studio, `${words.connect}\n${words.httpsOnly}`);
      await expect(httpsOnly.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.typed).toEqual([plainHttpAddress]);
      expect(studio.clicks.slice(-2)).toEqual([words.continueLabel, `Close ${words.connect}`]);
    });

    it("fails as NOT_REFUSED when a sign-in starts instead", async () => {
      const studio = studioWithConnections([row(userLabel)]);
      withConnectDialog(studio, words.openApproval);
      await expect(httpsOnly.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "NOT_REFUSED",
      });
    });
  });

  describe("add another account", () => {
    /** How the disconnected row reads, as Studio shows it today and before HAL-19032. */
    const disconnectedRows = {
      // Run 45749966189: Disconnect deleted the key, so the row says Not connected and Sign in.
      "no-key": [userLabel, words.notConnected, words.noKeyCallout, words.signIn, words.keyPower],
      // The callout's own text says Sign in again too (run 45715326517).
      "signed-out": [
        userLabel,
        words.signedOut,
        words.signedOutCallout,
        words.signInAgain,
        words.keyPower,
      ],
      connected: [row(userLabel)],
    };

    /**
     * A Studio whose Add another account, once approved, lists `afterApproval`
     * rows, and whose Disconnect leaves the second row as `disconnected` reads;
     * and the context whose approval does that.
     */
    function studioAddingAccount(
      afterApproval: number,
      disconnected: keyof typeof disconnectedRows = "no-key",
    ): {
      studio: FakeStudio;
      context: StepContext;
    } {
      const studio = studioWithConnections([row(userLabel)]);
      button(studio, "main", words.addAccount, () => {
        setText(studio, `${words.addAccount}\n${words.addAccountLead}`);
        button(studio, "main", words.continueLabel, () => setText(studio, words.openApproval));
      });
      // The fake finds the row's Disconnect and the confirmation's by their shared label alone.
      let disconnectClicks = 0;
      button(studio, "main", words.disconnect, () => {
        disconnectClicks += 1;
        if (disconnectClicks === 2) {
          const second = disconnectedRows[disconnected].join("\n");
          setText(studio, `Disconnected x. ${words.keyRevoked}\n${row(userLabel)}\n${second}`);
        }
      });
      const context: StepContext = {
        ...studio.context,
        approveSignIn: async () => {
          setText(studio, Array.from({ length: afterApproval }, () => row(userLabel)).join("\n"));
          return undefined;
        },
      };
      return { studio, context };
    }

    it("lists a second connection once approved, then disconnects it", async () => {
      const { studio, context } = studioAddingAccount(2);
      await expect(addAccount.run(context)).resolves.toEqual({
        passed: true,
        note: "Listed: 2 rows, 0 signed out, 0 not connected. After Disconnect: 2 rows, 0 signed out, 1 not connected.",
      });
      expect(studio.clicks.slice(-4)).toEqual([
        words.addAccount,
        words.continueLabel,
        words.disconnect,
        words.disconnect,
      ]);
    });

    it("passes when the disconnected row shows Signed out, as before HAL-19032", async () => {
      const { context } = studioAddingAccount(2, "signed-out");
      await expect(addAccount.run(context)).resolves.toMatchObject({
        passed: true,
        note: expect.stringContaining("After Disconnect: 2 rows, 1 signed out, 0 not connected."),
      });
    });

    it("fails as NOT_DISCONNECTED when the second row stays connected", async () => {
      const { context } = studioAddingAccount(2, "connected");
      await expect(addAccount.run(context)).resolves.toMatchObject({
        passed: false,
        code: "NOT_DISCONNECTED",
      });
    });

    it("picks the second row's Disconnect", () => {
      expect(rowDisconnect(2)).toMatch(/\)\[2\]$/);
    });

    it("fails as NO_SECOND_ACCOUNT when the list keeps one connection", async () => {
      await expect(addAccount.run(studioAddingAccount(1).context)).resolves.toMatchObject({
        passed: false,
        code: "NO_SECOND_ACCOUNT",
      });
    });

    it("fails as NOT_APPROVED with the test Paperclip's reason", async () => {
      const { context } = studioAddingAccount(2);
      const refusing = { ...context, approveSignIn: async () => "HTTP 404" };
      await expect(addAccount.run(refusing)).resolves.toEqual({
        passed: false,
        code: "NOT_APPROVED",
        note: "HTTP 404",
      });
    });
  });
});
