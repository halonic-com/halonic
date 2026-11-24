import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatSecretHold, secretHold } from "./secret-hold.ts";

// Invented, shaped like the real thing: a prefix and random-looking characters.
const googleSecret = `GOCSPX-${"aB3".repeat(8)}`;
const providerKey = `sk-proj-${"Xy7".repeat(8)}`;

verifies("inbox.secret-hold", () => {
  it("sends a Google client secret to a connector in the Library when no account waits", () => {
    expect(secretHold(googleSecret, { place: "connectors" })?.line).toBe(
      "This looks like a Google client secret. Messages are kept in the run log. Add the secret to a connector in the Library instead.",
    );
    expect(secretHold(googleSecret, { place: "connectors", phone: true })?.line).toBe(
      "This looks like a Google client secret. Messages are kept in the run log. Add the secret to a connector in the Library on your computer instead.",
    );
  });

  it("names a Google client secret and points to the secret field of the Google setup", () => {
    const hold = secretHold(`here it is: ${googleSecret}`);
    expect(hold?.shape).toBe("google-client-secret");
    expect(hold?.line).toBe(
      "This looks like a Google client secret. Messages are kept in the run log. Put it in the secret field of the Google setup instead.",
    );
  });

  it("sends a phone to its computer for the Google setup", () => {
    expect(secretHold(googleSecret, { phone: true })?.line).toBe(
      "This looks like a Google client secret. Messages are kept in the run log. Put it in the secret field of the Google setup on your computer instead.",
    );
  });

  it("sends a phone to its computer for Providers", () => {
    expect(secretHold(providerKey, { phone: true })?.line).toBe(
      "This looks like a secret key. Messages are kept in the run log. Put it in Providers on your computer instead.",
    );
  });

  it("points any other key to Providers", () => {
    expect(secretHold(providerKey)?.line).toBe(
      "This looks like a secret key. Messages are kept in the run log. Put it in Providers instead.",
    );
  });

  it("never repeats the text it found", () => {
    expect(secretHold(googleSecret)?.line).not.toContain("aB3");
    expect(secretHold(providerKey)?.line).not.toContain("Xy7");
  });

  it("lets an ordinary note through", () => {
    expect(secretHold("Use the shorter title")).toBeUndefined();
    expect(secretHold("We use sk-learn for this")).toBeUndefined();
  });
});

describe("chatSecretHold", () => {
  it("points a key to the key field, with the line the chats already show (H29)", () => {
    expect(chatSecretHold(`My key is ${providerKey}`)).toEqual({
      shape: "ai-provider-key",
      line: "This looks like an API key. Keys go in the key field, so they stay out of chats and files.",
      keyField: true,
    });
  });

  it("points a Google client secret to the Google setup or a connector, not the key field", () => {
    expect(chatSecretHold(googleSecret)).toEqual({
      shape: "google-client-secret",
      line: "This looks like a Google client secret. It goes in the Google setup or in a connector in the Library, so it stays out of chats and files.",
      keyField: false,
    });
  });

  it("never repeats the text it found", () => {
    expect(chatSecretHold(googleSecret)?.line).not.toContain("aB3");
    expect(chatSecretHold(providerKey)?.line).not.toContain("Xy7");
  });

  it("lets an ordinary message through", () => {
    expect(chatSecretHold("my key starts with sk-abc")).toBeUndefined();
    expect(chatSecretHold("We use sk-learn for this")).toBeUndefined();
  });
});
