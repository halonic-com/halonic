import { describe, expect, it } from "vitest";
import { type OfferFile, scanOffer, type UserValues } from "./scan.ts";

/*
 * Every fake key and address is built while the test runs, so this file
 * holds no secret-shaped text: the leak guard scans it like any other.
 */

/** A varied run of letters and digits, so it never looks like a placeholder. */
function filler(length: number): string {
  return "Q7x2Lm9Kp4Rt8Vw3Zc6Nb5Hj1Fd0GsYa".repeat(4).slice(0, length);
}

const fakeGithubToken = `ghp_${filler(36)}`;
const shopAddress = "Harbour Lane 12";
const profileEmail = ["sam.rivers", "mail.test"].join("@");
const otherAddress = ["orders", "shop.test"].join("@");

const user: UserValues = {
  settings: [
    { name: "shopAddress", value: shopAddress },
    { name: "region", value: "eu" },
  ],
  profileName: "Sam Rivers",
  profileEmail,
};

const folder = "integrations/offered/shop";

function file(name: string, ...lines: string[]): OfferFile {
  return { path: `${folder}/${name}`, text: lines.join("\n") };
}

describe("scanOffer", () => {
  it("blocks a fake key in the code, by rule, with file and line", () => {
    const code = file(
      "backend/index.js",
      "export const tool = {};",
      `const key = "${fakeGithubToken}";`,
    );
    const { findings } = scanOffer([code], user);
    expect(findings).toEqual([{ kind: "secret", rule: "github-token", file: code.path, line: 2 }]);
  });

  it("blocks an e-mail address on a non-example domain in a recording", () => {
    const recording = file("recordings/list.json", "{", `  "from": "${otherAddress}"`, "}");
    expect(scanOffer([recording], user).findings).toEqual([
      { kind: "email", file: recording.path, line: 2 },
    ]);
  });

  it("blocks the integration's own setting value, in any case, by setting name", () => {
    const recording = file(
      "recordings/order.json",
      `{ "ship_to": "${shopAddress.toUpperCase()}" }`,
    );
    expect(scanOffer([recording], user).findings).toEqual([
      { kind: "setting", setting: "shopAddress", file: recording.path, line: 1 },
    ]);
  });

  it("blocks the profile e-mail in OFFER.md once, as the profile e-mail", () => {
    const offer = file("OFFER.md", "# shop", `Built by ${profileEmail}`);
    expect(scanOffer([offer], user).findings).toEqual([
      { kind: "profile-email", file: offer.path, line: 2 },
    ]);
  });

  it("blocks the profile name, and a user value in a file's path", () => {
    const offer = { path: `${folder}/harbour-lane-12.md`, text: "Made by Sam Rivers." };
    const dashed = { ...user, settings: [{ name: "shopAddress", value: "harbour-lane-12" }] };
    expect(scanOffer([offer], dashed).findings).toEqual([
      { kind: "setting", setting: "shopAddress", file: offer.path, line: undefined },
      { kind: "profile-name", file: offer.path, line: 1 },
    ]);
  });

  it("lets example.com data, placeholders and look-alike words through", () => {
    const recording = file(
      "recordings/list.json",
      `{ "from": "${["orders", "shop.example.com"].join("@")}" }`,
      `{ "to": "${["a", "example.org"].join("@")}", "token": "ghp_${"X".repeat(36)}" }`,
      `import { z } from "zod@3.23.8"; // region: europe, Harbour Lanes 123`,
    );
    expect(scanOffer([recording], user).findings).toEqual([]);
  });

  it("never puts a value into a finding", () => {
    const offer = file(
      "OFFER.md",
      `${fakeGithubToken} ${otherAddress} ${shopAddress} Sam Rivers ${profileEmail}`,
    );
    const shown = JSON.stringify(scanOffer([offer], user));
    for (const value of [fakeGithubToken, otherAddress, shopAddress, "Sam Rivers", profileEmail]) {
      expect(shown.toLowerCase()).not.toContain(value.toLowerCase());
    }
  });

  it("finds a user value escaped in JSON and encoded in a URL or form body", () => {
    const quoted = { name: "shopName", value: 'Rivers "Harbour" Goods' };
    const withQuote = { ...user, settings: [quoted] };
    const recording = file(
      "recordings/order.json",
      `{ "shop": ${JSON.stringify(quoted.value)} }`,
      `{ "url": "https://api.shop.test/find?owner=${encodeURIComponent(profileEmail)}" }`,
      `{ "form": "shop=${encodeURIComponent(quoted.value).replaceAll("%20", "+")}" }`,
    );
    expect(scanOffer([recording], withQuote).findings).toEqual([
      { kind: "setting", setting: "shopName", file: recording.path, line: 1 },
      { kind: "profile-email", file: recording.path, line: 2 },
      { kind: "setting", setting: "shopName", file: recording.path, line: 3 },
    ]);
  });

  it("finds a URL-encoded address, and a key in a file's path", () => {
    const encoded = otherAddress.replace("@", "%40");
    const recording = file("recordings/find.json", `{ "url": "/orders?from=${encoded}" }`);
    const keyed = { path: `${folder}/${fakeGithubToken}.json`, text: "{}" };
    expect(scanOffer([recording, keyed], user).findings).toEqual([
      { kind: "email", file: recording.path, line: 1 },
      { kind: "secret", rule: "github-token", file: keyed.path, line: undefined },
    ]);
  });

  it("scans a value with a lone surrogate instead of throwing", () => {
    const broken = { ...user, settings: [{ name: "shopName", value: "Harbour \uD800 Goods" }] };
    const offer = file("OFFER.md", "Harbour \uD800 Goods");
    expect(scanOffer([offer], broken).findings).toEqual([
      { kind: "setting", setting: "shopName", file: offer.path, line: 1 },
    ]);
  });

  it("names values too short to check instead of matching them everywhere", () => {
    const code = file("backend/index.js", 'const region = "eu";');
    expect(scanOffer([code], user)).toEqual({
      findings: [],
      notChecked: [{ kind: "setting", setting: "region" }],
    });
  });

  it("skips empty values and finds nothing in an empty offer", () => {
    const empty: UserValues = {
      settings: [{ name: "note", value: " " }],
      profileName: undefined,
      profileEmail: undefined,
    };
    expect(scanOffer([], empty)).toEqual({ findings: [], notChecked: [] });
  });
});
