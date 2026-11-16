import type { SetupRecord, SetupRecords } from "@halonicjs/google-setup";
import { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { accountsOf, acmeKey, hostWith } from "./workspace-google-setup-accounts.testing.ts";
import type { GoogleSetupHost } from "./workspace-google-setup-accounts.ts";

verifies("studio.workspace-google-setup-accounts", () => {
  describe("changes through the agent host", () => {
    /** A host that does what the real one does to the records, and says what it was asked. */
    function hostOver(setups: SetupRecords, asked: string[]): GoogleSetupHost {
      const route = { app: "own", runsOn: "this-computer" } as const;
      return {
        disconnect: async () => ({ googleConfirmed: true }),
        start: async (connector, accountType) => {
          asked.push(`start ${connector.workspace}/${connector.id} ${accountType}`);
          return (await setups.start({ route, accountType, connector })).accountRef;
        },
        edit: async (accountRef, change) => {
          asked.push(`edit ${accountRef} ${change.kind}`);
        },
        saveClientSecret: async () => {},
        replaceClientSecret: async () => ({ result: "replaced" }),
        startOver: async (accountRef) => {
          asked.push(`start-over ${accountRef}`);
          const old = (await setups.read(accountRef)) as SetupRecord;
          await setups.remove(accountRef);
          const fresh = await setups.start({
            route,
            accountType: old.accountType,
            connector: old.connector,
          });
          return { clientSecret: "none-saved", accountRef: fresh.accountRef };
        },
        startSignIn: async (accountRef) => {
          asked.push(`sign-in ${accountRef}`);
          return "https://accounts.example/auth";
        },
        cancelSignIn: async (accountRef) => {
          asked.push(`cancel ${accountRef}`);
        },
      };
    }

    it("starts a setup for a connector with the link to it, and lists it as an account", async () => {
      const asked: string[] = [];
      const { accounts: bare, setups } = await accountsOf({ host: (own) => hostOver(own, asked) });

      const ref = await bare.start("calendar", "workspace");

      expect(asked).toEqual([`start ${acmeKey}/calendar workspace`]);
      expect((await setups.read(ref))?.connector).toEqual({ workspace: acmeKey, id: "calendar" });
    });

    it("keeps the record a connector already has instead of starting a second", async () => {
      const asked: string[] = [];
      const { accounts, setups } = await accountsOf({ host: (own) => hostOver(own, asked) });
      const mail = (await setups.forConnector(acmeKey, "mail")) as SetupRecord;

      expect(await accounts.start("mail", "personal")).toBe(mail.accountRef);
      expect(asked).toEqual([]);
    });

    it("saves one edit and tells its listeners", async () => {
      const asked: string[] = [];
      const { accounts } = await accountsOf({ host: (own) => hostOver(own, asked) });
      const listener = vi.fn();
      accounts.subscribe(listener);

      await accounts.edit("gaccount_1", { kind: "project-id", projectId: "acme-project" });

      expect(asked).toEqual(["edit gaccount_1 project-id"]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    describe("client secret", () => {
      let mailRef = "";
      const typed = new SecretText("GOCSPX-typed-in-the-field");

      it("sends the secret to the host once, with the account's ref, and tells its listeners", async () => {
        const received: [string, string][] = [];
        const { accounts } = await accountsOf({
          host: hostWith({
            saveClientSecret: async (ref, secret) => {
              received.push([ref, secret.reveal()]);
            },
          }),
        });
        const listener = vi.fn();
        accounts.subscribe(listener);

        await accounts.saveClientSecret("gaccount_1", typed);

        expect(received).toEqual([["gaccount_1", "GOCSPX-typed-in-the-field"]]);
        expect(listener).toHaveBeenCalledTimes(1);
      });

      it("rejects a failed save in plain words without the secret, and still tells its listeners", async () => {
        const { accounts } = await accountsOf({
          host: hostWith({
            saveClientSecret: async () => {
              throw new Error("The agent host answered with 502 (google_failed).");
            },
          }),
        });
        const listener = vi.fn();
        accounts.subscribe(listener);

        const failure = await accounts.saveClientSecret("gaccount_1", typed).catch((e) => e);

        expect(failure.message).toBe(
          "Halonic couldn't save the client secret. The agent host answered with 502 (google_failed).",
        );
        expect(failure.message).not.toContain("GOCSPX");
        expect(listener).toHaveBeenCalledTimes(1);
      });

      it("answers an accepted replace with the addresses of the accounts it fixed", async () => {
        const { accounts, setups } = await accountsOf({
          host: hostWith({
            replaceClientSecret: async () => ({
              result: "accepted",
              accountsFixed: [mailRef, "gaccount_unknown"],
            }),
          }),
        });
        mailRef = ((await setups.forConnector(acmeKey, "mail")) as SetupRecord).accountRef;

        expect(await accounts.replaceClientSecret("gaccount_1", typed)).toEqual({
          kind: "accepted",
          usedBy: ["sam@acme.example"],
        });
      });

      it.each([
        ["replaced", { kind: "replaced" }],
        ["refused", { kind: "refused" }],
        ["unreachable", { kind: "no-network" }],
      ] as const)("answers a replace that ended %s", async (result, answer) => {
        const { accounts } = await accountsOf({
          host: hostWith({ replaceClientSecret: async () => ({ result }) }),
        });

        expect(await accounts.replaceClientSecret("gaccount_1", typed)).toEqual(answer);
      });

      it.each([
        "signInRefused",
        "nothingStaged",
        "notSignedIn",
        "googleError",
        "unexpectedAnswer",
      ] as const)(
        "rejects a check that ended %s, saying the old secret is still in use",
        async (result) => {
          const { accounts } = await accountsOf({
            host: hostWith({ replaceClientSecret: async () => ({ result }) }),
          });

          await expect(accounts.replaceClientSecret("gaccount_1", typed)).rejects.toThrow(
            "The old one is still in use.",
          );
        },
      );
    });

    it("starts over in one host step that leaves a fresh record for the same connector", async () => {
      const asked: string[] = [];
      const { accounts, setups } = await accountsOf({ host: (own) => hostOver(own, asked) });
      const mail = (await setups.forConnector(acmeKey, "mail")) as SetupRecord;

      await accounts.startOver(mail.accountRef);

      const fresh = (await setups.forConnector(acmeKey, "mail")) as SetupRecord;
      expect(fresh.accountRef).not.toBe(mail.accountRef);
      expect(fresh.accountType).toBe(mail.accountType);
      expect(asked).toEqual([`start-over ${mail.accountRef}`]);
    });

    it("tells its listeners to read again when start over fails", async () => {
      const { accounts, setups } = await accountsOf({
        host: (own) => ({
          ...hostOver(own, []),
          startOver: async () => {
            throw new Error("The agent host answered with 502 (google_failed).");
          },
        }),
      });
      const mail = (await setups.forConnector(acmeKey, "mail")) as SetupRecord;
      const listener = vi.fn();
      accounts.subscribe(listener);

      await expect(accounts.startOver(mail.accountRef)).rejects.toThrow(
        "Halonic couldn't start over. The agent host answered with 502",
      );

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("starts and cancels a sign-in", async () => {
      const asked: string[] = [];
      const { accounts } = await accountsOf({ host: (own) => hostOver(own, asked) });

      expect(await accounts.startSignIn("gaccount_1")).toBe("https://accounts.example/auth");
      await accounts.cancelSignIn("gaccount_1");

      expect(asked).toEqual(["sign-in gaccount_1", "cancel gaccount_1"]);
    });

    it("rejects in plain words with the host's reason, and tells its listeners to read again, when the host can't", async () => {
      const { accounts } = await accountsOf({
        host: (own) => ({
          ...hostOver(own, []),
          edit: async () => {
            throw new Error("The agent host answered with 502 (google_failed).");
          },
        }),
      });
      const listener = vi.fn();
      accounts.subscribe(listener);

      await expect(accounts.edit("gaccount_1", { kind: "sign-in-dropped" })).rejects.toThrow(
        "Halonic couldn't save this. The agent host answered with 502",
      );
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("says the app needs its agent host when it has none, without the old 'not yet' text", async () => {
      const { accounts } = await accountsOf();

      for (const attempt of [
        accounts.start("mail", "personal"),
        accounts.edit("gaccount_1", { kind: "sign-in-dropped" }),
        accounts.startOver("gaccount_1"),
        accounts.startSignIn("gaccount_1"),
        accounts.cancelSignIn("gaccount_1"),
        accounts.saveClientSecret("gaccount_1", new SecretText("GOCSPX-test-value")),
        accounts.replaceClientSecret("gaccount_1", new SecretText("GOCSPX-test-value")),
        accounts.disconnect("gaccount_1"),
      ]) {
        await expect(attempt).rejects.toThrow("needs its agent host");
        await expect(attempt).rejects.not.toThrow("yet");
      }
    });
  });
});
