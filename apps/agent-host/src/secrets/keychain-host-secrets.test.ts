import { createHash } from "node:crypto";
import { MemorySecretStore } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FrameDecoder } from "../stdio/frame-codec.ts";
import { FakeKeychainShell } from "./fake-keychain-shell.test-helper.ts";
import { KeychainHostSecrets, SecretMoveConflict } from "./keychain-host-secrets.ts";
import { KeychainError, ShellKeychainSecretStore } from "./shell-keychain-secret-store.ts";
import { ShellSecretsChannel } from "./shell-secrets-channel.ts";

// Made-up values: never keys anyone uses.
const fileValue = "made-up-file-value";
const keychainValue = "made-up-keychain-value";

/** A keychain store whose channel a fake shell answers, with the profile's secrets file in memory. */
function setUp() {
  const channel = new ShellSecretsChannel();
  const shell = new FakeKeychainShell((frame) => {
    for (const each of new FrameDecoder().push(frame)) channel.receive(each);
  });
  channel.open({
    send(frame, done) {
      // The shell answers on its own turn, as over a pipe.
      setImmediate(() => {
        for (const each of new FrameDecoder().push(frame)) shell.take(each);
        done?.();
      });
    },
  });
  const keychain = new ShellKeychainSecretStore(channel);
  const file = new MemorySecretStore();
  const log: string[] = [];
  const secrets = new KeychainHostSecrets(keychain, file, (text) => log.push(text));
  return { shell, keychain, file, log, secrets };
}

verifies("agent-host.keychain-secrets", () => {
  describe("ShellKeychainSecretStore", () => {
    it("reads, saves and removes the host's key under the name the keychain keeps", async () => {
      const { shell, keychain } = setUp();
      expect(await keychain.get("remote-host-key")).toBeNull();
      await keychain.set("remote-host-key", keychainValue);
      expect(shell.stored.get("remote_host_key")).toBe(keychainValue);
      expect(await keychain.get("Remote_Host_Key")).toBe(keychainValue);
      expect(await keychain.names()).toEqual(["remote-host-key"]);
      await keychain.remove("remote-host-key");
      expect(shell.stored.size).toBe(0);
    });

    it.each(["token-key", "serve-password", "halonic_token_google", "openai-key"])(
      "refuses %s before it asks the shell, which would stop the host",
      async (name) => {
        const { shell, keychain } = setUp();
        await expect(keychain.get(name)).rejects.toThrow(RangeError);
        await expect(keychain.set(name, keychainValue)).rejects.toThrow(RangeError);
        await expect(keychain.remove(name)).rejects.toThrow(RangeError);
        expect(shell.asked).toEqual([]);
      },
    );

    it("fails with the shell's reason when the keychain can't be used", async () => {
      const { shell, keychain } = setUp();
      shell.failWith = "unavailable";
      const reading = keychain.get("remote-host-key");
      await expect(reading).rejects.toBeInstanceOf(KeychainError);
      await expect(reading).rejects.toMatchObject({
        kind: "unavailable",
        message: "The keychain couldn't read remote-host-key: No keychain on this system.",
      });
    });

    it("sends the second of two reads at once only after the first answer", async () => {
      const { shell, keychain } = setUp();
      shell.stored.set("remote_host_key", keychainValue);
      const both = await Promise.all([
        keychain.get("remote-host-key"),
        keychain.get("remote-host-key"),
      ]);
      expect(both).toEqual([keychainValue, keychainValue]);
      expect(shell.asked).toEqual(["get remote_host_key", "get remote_host_key"]);
    });
  });

  describe("KeychainHostSecrets", () => {
    it("moves the key out of the secrets file before its first use, and says so without the value", async () => {
      const { shell, file, log, secrets } = setUp();
      await file.set("remote-host-key", fileValue);
      expect(await secrets.get("remote-host-key")).toBe(fileValue);
      expect(shell.stored.get("remote_host_key")).toBe(fileValue);
      expect(await file.get("remote-host-key")).toBeNull();
      expect(log).toEqual(["Moved remote-host-key from the secrets file to the keychain.\n"]);

      await secrets.get("remote-host-key");
      expect(shell.asked.filter((each) => each.startsWith("set"))).toHaveLength(1);
    });

    it("removes the file's copy when the keychain holds the same value", async () => {
      const { shell, file, log, secrets } = setUp();
      await file.set("remote-host-key", keychainValue);
      shell.stored.set("remote_host_key", keychainValue);
      await secrets.moveOutOfFile();
      expect(await file.get("remote-host-key")).toBeNull();
      expect(shell.stored.get("remote_host_key")).toBe(keychainValue);
      expect(log).toEqual([
        "Removed the secrets file's copy of remote-host-key; the keychain holds it.\n",
      ]);
    });

    it("changes neither and refuses every use when the two hold different values", async () => {
      const { shell, file, log, secrets } = setUp();
      await file.set("remote-host-key", fileValue);
      shell.stored.set("remote_host_key", keychainValue);

      const reading = secrets.get("remote-host-key");
      await expect(reading).rejects.toBeInstanceOf(SecretMoveConflict);
      await expect(reading).rejects.toThrow(/The keychain's value wins/);
      await expect(secrets.set("remote-host-key", keychainValue)).rejects.toThrow(
        SecretMoveConflict,
      );
      expect(await file.get("remote-host-key")).toBe(fileValue);
      expect(shell.stored.get("remote_host_key")).toBe(keychainValue);

      const said = log.join("");
      for (const value of [fileValue, keychainValue]) {
        expect(said).not.toContain(value);
        expect(said).not.toContain(createHash("sha256").update(value).digest("hex"));
        expect(said).not.toContain(createHash("sha256").update(value).digest("base64url"));
      }
    });

    it("keeps the file's copy when the keychain gives back another value than it was given", async () => {
      const { shell, file, secrets } = setUp();
      await file.set("remote-host-key", fileValue);
      shell.keepInstead = keychainValue;
      await expect(secrets.moveOutOfFile()).rejects.toThrow(/stays in the secrets file/);
      expect(await file.get("remote-host-key")).toBe(fileValue);
    });

    it("never falls back to the file when the keychain can't be used, and tries the move again on the next use", async () => {
      const { shell, file, secrets } = setUp();
      await file.set("remote-host-key", fileValue);
      shell.failWith = "unavailable";
      await expect(secrets.get("remote-host-key")).rejects.toMatchObject({ kind: "unavailable" });
      await expect(secrets.set("remote-host-key", keychainValue)).rejects.toThrow(KeychainError);
      expect(await file.get("remote-host-key")).toBe(fileValue);

      shell.failWith = undefined;
      expect(await secrets.get("remote-host-key")).toBe(fileValue);
      expect(await file.get("remote-host-key")).toBeNull();
    });

    it("doesn't ask the keychain to move anything when the file holds nothing", async () => {
      const { shell, secrets } = setUp();
      await secrets.moveOutOfFile();
      expect(shell.asked).toEqual([]);
    });
  });
});
