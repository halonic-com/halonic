import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { holdsSecretShape } from "./secret-shape.ts";

/** A made-up JWT: base64url JSON header and payload, and a random-looking tail. */
const jwt = `eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJhZ2VudC0xIn0.${"Zm9vYmFy".repeat(4)}`;

verifies("paperclip.front-bot-grounding", () => {
  test("a JWT, like our agent keys and broker tokens, counts as a key", () => {
    expect(holdsSecretShape(`The key is ${jwt}`)).toBe(true);
  });

  test("GitHub's installation, OAuth, user and refresh tokens count as keys", () => {
    for (const prefix of ["ghs_", "gho_", "ghu_", "ghr_"]) {
      expect(holdsSecretShape(`token ${prefix}${"Q7x2Lm9K".repeat(3)}`)).toBe(true);
    }
  });

  test("Studio's shapes still count, and ordinary words don't", () => {
    expect(holdsSecretShape(`sk-ant-api03-${"Q7x2Lm9K".repeat(4)}`)).toBe(true);
    expect(holdsSecretShape("Is #6129 merged yet? See eyJ docs and the ghs_ prefix.")).toBe(false);
  });
});
