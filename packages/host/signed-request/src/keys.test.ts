import { encodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { importPublicKey, importSigningKey } from "./keys.ts";
import { makeTestKey } from "./signed-request.test-helper.ts";

verifies("signed-request.keys", () => {
  it("reads both halves as keys that sign and verify and can't be exported", async () => {
    const made = await makeTestKey("k1");
    const signing = await importSigningKey("k1", made.privateText);
    const publicKey = await importPublicKey(made.publicText);
    if (!signing.ok || !publicKey.ok) {
      throw new Error("the key pair didn't read");
    }
    const data = new TextEncoder().encode("hello");
    const signature = await crypto.subtle.sign("Ed25519", signing.value.privateKey, data);
    expect(await crypto.subtle.verify("Ed25519", publicKey.value, signature, data)).toBe(true);

    expect(signing.value.id).toBe("k1");
    expect(signing.value.privateKey.extractable).toBe(false);
    expect(signing.value.privateKey.usages).toEqual(["sign"]);
    expect(publicKey.value.extractable).toBe(false);
    expect(publicKey.value.usages).toEqual(["verify"]);
  });

  it("refuses a public key that isn't 32 bytes of base64url", async () => {
    expect(await importPublicKey(encodeBase64url(new Uint8Array(31)))).toEqual({
      ok: false,
      error: "not_an_ed25519_key",
    });
    expect(await importPublicKey("not base64url!")).toEqual({ ok: false, error: "not_base64url" });
  });

  it("refuses a private key that isn't Ed25519, without its text in the refusal", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const otherText = encodeBase64url(
      new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
    );
    const refused = await importSigningKey("k1", otherText);
    expect(refused).toEqual({ ok: false, error: "not_an_ed25519_key" });
    expect(JSON.stringify(refused)).not.toContain(otherText.slice(0, 16));
    expect(await importSigningKey("k1", "%%%")).toEqual({ ok: false, error: "not_base64url" });
  });

  it("refuses a key id the headers can't carry", async () => {
    const made = await makeTestKey("k1");
    expect(await importSigningKey("k 1", made.privateText)).toEqual({
      ok: false,
      error: "bad_key_id",
    });
  });
});
