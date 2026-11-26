import { encodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type CloudKey,
  type CloudKeySet,
  CloudSessionVerifier,
  type RevokedSessions,
} from "./cloud-session-verifier.ts";
import { checkClaims } from "./principal.ts";
import { ids } from "./stub-session-verifier.test-helper.ts";

const signInOrigin = "https://sign-in.acme.example";
const product = "prod_acmeAAAAAAAAAAAAAAAA";
const nowSeconds = 1_800_000_000;

/** A generated key pair; the test libraries don't name WebCrypto's type. */
interface KeyPair {
  readonly publicKey: CryptoKey;
  readonly privateKey: CryptoKey;
}

interface TestKeys {
  readonly session: KeyPair;
  readonly command: KeyPair;
  readonly outsider: KeyPair;
}

let keys: TestKeys;

beforeAll(async () => {
  const generate = () =>
    crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]) as Promise<KeyPair>;
  keys = { session: await generate(), command: await generate(), outsider: await generate() };
});

function keySet(): CloudKeySet {
  const byId = new Map<string, CloudKey>([
    ["s1", { id: "s1", job: "session", publicKey: keys.session.publicKey }],
    ["c1", { id: "c1", job: "command", publicKey: keys.command.publicKey }],
  ]);
  return { key: async (id) => byId.get(id) ?? null };
}

function revokedList(revoked: readonly string[] = []): RevokedSessions {
  return { isRevoked: async (sessionId) => revoked.includes(sessionId) };
}

function verifier(
  changes: { keySet?: CloudKeySet; revokedSessions?: RevokedSessions } = {},
): CloudSessionVerifier {
  return new CloudSessionVerifier({
    signInOrigin,
    product,
    keySet: changes.keySet ?? keySet(),
    revokedSessions: changes.revokedSessions ?? revokedList(),
    now: () => nowSeconds * 1000,
  });
}

function goodPayload(): Record<string, unknown> {
  return {
    iss: signInOrigin,
    sub: ids.alice,
    aud: product,
    sid: "ses_one",
    session_audience: "app",
    token_use: "access",
    iat: nowSeconds - 10,
    nbf: nowSeconds - 10,
    exp: nowSeconds + 890,
  };
}

function encodeJson(value: unknown): string {
  return encodeBase64url(new TextEncoder().encode(JSON.stringify(value)));
}

/** Signs a compact token with `privateKey`, with any header or payload field replaced. */
async function token(
  options: {
    header?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    privateKey?: CryptoKey;
  } = {},
): Promise<string> {
  const header = { alg: "EdDSA", typ: "JWT", kid: "s1", ...options.header };
  const payload = { ...goodPayload(), ...options.payload };
  return signParts(encodeJson(header), encodeJson(payload), options.privateKey);
}

/** Signs already encoded parts, so a test can sign bytes `token` would never write. */
async function signParts(
  headerText: string,
  payloadText: string,
  privateKey = keys.session.privateKey,
): Promise<string> {
  const signedText = `${headerText}.${payloadText}`;
  const signature = await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    new TextEncoder().encode(signedText),
  );
  return `${signedText}.${encodeBase64url(new Uint8Array(signature))}`;
}

async function verifyToken(text: string, onto = verifier()) {
  return onto.verify({ kind: "cookie", token: text });
}

describe("cloud session verifier", () => {
  verifies("server.cloud-session", () => {
    it("accepts a token Cloud signed for this product and maps it to the user's own scope", async () => {
      const claims = await verifyToken(await token());
      expect(claims).toEqual({
        aud: "app",
        sub: ids.alice,
        scope: `u/${ids.alice}`,
        role: undefined,
        sid: "ses_one",
      });
      expect(checkClaims(claims)?.principal.actor).toBe(ids.alice);
    });

    it("refuses a token signed by a command key even when its key id is in the set", async () => {
      const signedByCommandKey = await token({
        header: { kid: "c1" },
        privateKey: keys.command.privateKey,
      });
      expect(await verifyToken(signedByCommandKey)).toBeNull();
    });

    it("refuses a key id that isn't in the set and a signature by another key", async () => {
      expect(await verifyToken(await token({ header: { kid: "s2" } }))).toBeNull();
      const forged = await token({ privateKey: keys.outsider.privateKey });
      expect(await verifyToken(forged)).toBeNull();
    });

    it("fixes the algorithm and type, and refuses a critical extension", async () => {
      const seenKeyIds: string[] = [];
      const watchedKeySet: CloudKeySet = {
        key: async (id) => {
          seenKeyIds.push(id);
          return keySet().key(id);
        },
      };
      for (const header of [{ alg: "none" }, { alg: "ES256" }, { typ: "jwt" }, { crit: ["x"] }]) {
        const refused = await verifyToken(
          await token({ header }),
          verifier({ keySet: watchedKeySet }),
        );
        expect(refused).toBeNull();
      }
      expect(seenKeyIds).toEqual([]);
    });

    it("refuses another issuer, another product, and account or seller sessions", async () => {
      for (const payload of [
        { iss: "https://evil.example" },
        { aud: "prod_otherAAAAAAAAAAAAAAA" },
        { aud: [product] },
        { session_audience: "account" },
        { session_audience: "seller" },
        { token_use: "refresh" },
      ]) {
        expect(await verifyToken(await token({ payload }))).toBeNull();
      }
    });

    it("allows 60 seconds of clock skew on the end, the start and the issue time", async () => {
      const accepted = [
        { exp: nowSeconds - 59 },
        { nbf: nowSeconds + 59 },
        { iat: nowSeconds + 59 },
      ];
      for (const payload of accepted) {
        expect(await verifyToken(await token({ payload }))).not.toBeNull();
      }
      const refused = [
        { exp: nowSeconds - 61 },
        { nbf: nowSeconds + 61 },
        { iat: nowSeconds + 61 },
        { exp: undefined },
        { nbf: "0" },
      ];
      for (const payload of refused) {
        expect(await verifyToken(await token({ payload }))).toBeNull();
      }
    });

    it("refuses a token that lives longer than 15 minutes from its issue time", async () => {
      const issued = nowSeconds - 10;
      const atLimit = await token({ payload: { iat: issued, exp: issued + 900 } });
      expect(await verifyToken(atLimit)).not.toBeNull();
      const overLimit = await token({ payload: { iat: issued, exp: issued + 901 } });
      expect(await verifyToken(overLimit)).toBeNull();
    });

    it("refuses a revoked session and a missing session id, and fails when the list can't answer", async () => {
      expect(
        await verifyToken(await token(), verifier({ revokedSessions: revokedList(["ses_one"]) })),
      ).toBeNull();
      expect(await verifyToken(await token({ payload: { sid: undefined } }))).toBeNull();
      const broken: RevokedSessions = {
        isRevoked: async () => {
          throw new Error("list unavailable");
        },
      };
      await expect(
        verifyToken(await token(), verifier({ revokedSessions: broken })),
      ).rejects.toThrow("list unavailable");
    });

    it("fails, never refuses quietly, when the key set can't answer", async () => {
      const broken: CloudKeySet = {
        key: async () => {
          throw new Error("key set unavailable");
        },
      };
      await expect(verifyToken(await token(), verifier({ keySet: broken }))).rejects.toThrow(
        "key set unavailable",
      );
    });

    it("refuses malformed and oversized tokens", async () => {
      const good = await token();
      const [header, payload, signature] = good.split(".");
      for (const text of [
        "",
        `${header}.${payload}`,
        `${good}.extra`,
        `${header}=.${payload}.${signature}`,
        `${encodeBase64url(new Uint8Array([0xff]))}.${payload}.${signature}`,
        `${encodeJson([1])}.${payload}.${signature}`,
        `${good}${"A".repeat(8192)}`,
      ]) {
        expect(await verifyToken(text)).toBeNull();
      }
    });

    it("refuses a header that starts with a byte-order mark, even when correctly signed", async () => {
      const headerJson = JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: "s1" });
      const byteOrderMark = String.fromCharCode(0xfeff);
      const withMark = new TextEncoder().encode(`${byteOrderMark}${headerJson}`);
      const signed = await signParts(encodeBase64url(withMark), encodeJson(goodPayload()));
      expect(await verifyToken(signed)).toBeNull();
    });

    it("leaves the end-user pattern to the shared checks, which refuse a bad id", async () => {
      const claims = await verifyToken(await token({ payload: { sub: "eu_short" } }));
      expect(claims).not.toBeNull();
      expect(checkClaims(claims)).toBeNull();
    });

    it("can only be built with an https sign-in origin and a product", () => {
      const build = (origin: string, productId = product) =>
        new CloudSessionVerifier({
          signInOrigin: origin,
          product: productId,
          keySet: keySet(),
          revokedSessions: revokedList(),
        });
      for (const origin of ["http://sign-in.acme.example", "https://sign-in.acme.example/", "x"]) {
        expect(() => build(origin)).toThrow("https origin");
      }
      expect(() => build(signInOrigin, "")).toThrow("product");
    });
  });
});

describe("cloud session profile", () => {
  const profile = {
    name: "Sofia Marin",
    account: "https://account.acme.example/prod_acmeAAAAAAAAAAAAAAAA",
    product_name: "Acme Agents",
  };

  verifies("server.cloud-session-profile", () => {
    it("passes a well-formed name, account page and product name on to the session", async () => {
      const claims = await verifyToken(await token({ payload: profile }));
      expect(checkClaims(claims)?.profile).toEqual({
        name: "Sofia Marin",
        account: "https://account.acme.example/prod_acmeAAAAAAAAAAAAAAAA",
        productName: "Acme Agents",
        billing: null,
      });
    });

    it("passes a signed billing pair on, and accepts a token whose pair is wrong", async () => {
      const pair = { billing: "payment_failed", billing_until: "2026-12-02" };
      const signed = await verifyToken(await token({ payload: { ...profile, ...pair } }));
      expect(checkClaims(signed)?.profile?.billing).toEqual({
        state: "payment_failed",
        until: "2026-12-02",
      });
      for (const wrong of [
        { ...pair, billing: "late" },
        { ...pair, billing_until: "2026-02-30" },
        { billing: "payment_failed" },
      ]) {
        const accepted = await verifyToken(await token({ payload: { ...profile, ...wrong } }));
        expect(checkClaims(accepted)?.profile?.billing, JSON.stringify(wrong)).toBeNull();
      }
    });

    it("refuses an http account address, or one with a user or password in it", async () => {
      for (const account of [
        "http://account.acme.example/prod_acme",
        "https://alice@account.acme.example/prod_acme",
        "https://:secret@account.acme.example/prod_acme",
        "javascript:alert(1)",
        "account.acme.example/prod_acme",
        42,
      ]) {
        const refused = await token({ payload: { ...profile, account } });
        expect(await verifyToken(refused), String(account)).toBeNull();
      }
    });

    it("refuses a name or product name over 200 characters, or one that isn't text", async () => {
      for (const changes of [
        { name: "a".repeat(201) },
        { product_name: "a".repeat(201) },
        { name: 7 },
        { product_name: null },
      ]) {
        const refused = await token({ payload: { ...profile, ...changes } });
        expect(await verifyToken(refused), JSON.stringify(changes)).toBeNull();
      }
    });

    it("counts characters, so 200 emoji are accepted and 201 are refused", async () => {
      const accepted = await verifyToken(
        await token({ payload: { ...profile, name: "😀".repeat(200) } }),
      );
      expect(checkClaims(accepted)?.profile?.name).toBe("😀".repeat(200));
      const refused = await token({ payload: { ...profile, name: "😀".repeat(201) } });
      expect(await verifyToken(refused)).toBeNull();
    });

    it("refuses a token with only some of the three, and accepts one with none", async () => {
      const { product_name: _left, ...partial } = profile;
      expect(await verifyToken(await token({ payload: partial }))).toBeNull();
      const without = await verifyToken(await token());
      expect(checkClaims(without)?.profile).toBeNull();
    });

    it("refuses wrong claims in the shared checks too, whatever verifier returned them", () => {
      const claims = { aud: "app", sub: ids.alice, scope: `u/${ids.alice}` };
      expect(checkClaims({ ...claims, ...profile, account: "http://x.example" })).toBeNull();
      expect(checkClaims({ ...claims, ...profile })?.profile?.productName).toBe("Acme Agents");
    });
  });
});
