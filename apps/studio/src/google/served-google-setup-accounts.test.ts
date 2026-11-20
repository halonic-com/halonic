import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { ServedGoogleSetupAccounts } from "./served-google-setup-accounts.ts";

const setup = {
  accountRef: "gaccount_abc123",
  account: "kim@acme.example",
  available: [{ id: "gmail", label: "Gmail", googleApis: [], googleScopes: [] }],
  route: { app: "own", runsOn: "this-computer" },
  accountType: "personal",
  startedAt: "2026-11-08T10:00:00.000Z",
  projectId: null,
  stepsDone: { project: "2026-11-08T10:05:00.000Z" },
  inProductionTickedAt: null,
  clientId: null,
  clientSecretSavedAt: null,
  signInStartedAt: null,
  lastSignInAt: null,
  wrongAccountAt: null,
  lastSignInEnded: null,
  refreshRefused: null,
  services: {},
};

function accountsAnswering(response: () => Response) {
  const fetchPage = vi.fn(async (_path: string) => response());
  return { accounts: new ServedGoogleSetupAccounts(fetchPage), fetchPage };
}

verifies("studio.served-google-setup-accounts", () => {
  it("reads the setups from /api/google/setups with their address and services", async () => {
    const { accounts, fetchPage } = accountsAnswering(() =>
      Response.json({ signIn: "elsewhere", setups: [setup] }),
    );
    const listed = await accounts.list();
    expect(fetchPage).toHaveBeenCalledWith("/api/google/setups");
    expect(listed.map(({ email, services }) => [email, services.map(({ id }) => id)])).toEqual([
      ["kim@acme.example", ["gmail"]],
    ]);
    expect(listed[0]?.record.stepsDone).toEqual(setup.stepsDone);
    expect(accounts.signInEntry).toEqual({ kind: "elsewhere", commandExists: true });
    expect(accounts.checkAgainEntry).toEqual({ kind: "sign-in-again", where: "computer" });
  });

  it("takes `here` from the computer's answer", async () => {
    const { accounts } = accountsAnswering(() => Response.json({ signIn: "here", setups: [] }));
    await accounts.list();
    expect(accounts.signInEntry).toEqual({ kind: "here" });
  });

  it.each([
    ["a refusal", () => new Response("{}", { status: 401 })],
    ["a page that isn't JSON", () => new Response("<html></html>")],
    ["an unknown place", () => Response.json({ signIn: "nearby", setups: [] })],
    [
      "a setup without an address",
      () => Response.json({ signIn: "here", setups: [{ ...setup, account: undefined }] }),
    ],
  ])("fails the read on %s", async (_what, response) => {
    const { accounts } = accountsAnswering(response);
    await expect(accounts.list()).rejects.toThrow();
    expect(accounts.signInEntry).toEqual({ kind: "elsewhere", commandExists: true });
  });

  describe("changes", () => {
    it("are refused and send no request", async () => {
      const { accounts, fetchPage } = accountsAnswering(() => Response.json({}));
      const tries = [
        accounts.edit(),
        accounts.saveClientSecret("gaccount_abc123", {} as never),
        accounts.replaceClientSecret("gaccount_abc123", {} as never),
        accounts.startOver(),
        accounts.disconnect(),
        accounts.startSignIn(),
        accounts.cancelSignIn(),
        accounts.checkAgain(),
        accounts.wrongAccount(),
        accounts.changeAddress(),
      ];
      for (const attempt of tries) {
        await expect(attempt).rejects.toThrow("only read the Google setup");
      }
      expect(fetchPage).not.toHaveBeenCalled();
    });
  });
});
