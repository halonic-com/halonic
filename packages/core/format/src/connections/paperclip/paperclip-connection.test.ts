import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type FileProblem, paperclipConnectionKey, parsePaperclipConnection } from "../../index.ts";
import { summary, yaml } from "../../test/parse.spec.ts";

const label = "label: Acme";
const company = "company: acme-company-1";

/** The problems of a file that must fail. */
function problemsOf(text: string): FileProblem[] {
  const parsed = parsePaperclipConnection(text);
  if (parsed.ok) {
    expect.fail(`expected the file to fail, got ${JSON.stringify(parsed.value)}`);
  }
  return parsed.error;
}

verifies("workspace.paperclip-connection", () => {
  it("reads a label, an https address and a company", () => {
    const parsed = parsePaperclipConnection(
      yaml(label, "address: https://paperclip.example.com", company),
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        value: {
          label: "Acme",
          address: "https://paperclip.example.com",
          company: "acme-company-1",
        },
        warnings: [],
      },
    });
  });

  it("refuses a key, naming the field and saying keys live in the keychain", () => {
    const problems = problemsOf(
      yaml(label, "address: https://paperclip.example.com", company, "key: pcp_acme"),
    );
    expect(summary(problems)).toEqual([" unrecognized_keys 4"]);
    expect(problems[0]?.message).toBe(
      'A connection file holds only label, address and company, so "key" can\'t be in it: Paperclip keys live in the keychain, never in the workspace. Remove the line.',
    );
  });

  it.each(["token", "apiKey", "secret"])("refuses a %s the same way", (field) => {
    const problems = problemsOf(
      yaml(label, "address: https://paperclip.example.com", company, `${field}: x`),
    );
    expect(problems[0]?.message).toContain(`"${field}" can't be in it`);
    expect(problems[0]?.message).toContain("keychain");
  });

  it("keeps the shared words for another unknown field", () => {
    const problems = problemsOf(
      yaml(label, "address: https://paperclip.example.com", company, "colour: blue"),
    );
    expect(summary(problems)).toEqual([" unrecognized_keys 4"]);
    expect(problems[0]?.message).not.toContain("keychain");
  });

  it("refuses http:// to another computer", () => {
    const problems = problemsOf(yaml(label, "address: http://paperclip.example.com", company));
    expect(summary(problems)).toEqual(["address paperclip-address 2"]);
    expect(problems[0]?.message).toBe(
      "Use https:// for paperclip.example.com: http:// is only for a server on this computer (localhost or 127.0.0.1), because the key would travel unencrypted.",
    );
  });

  it.each(["http://localhost:3100", "http://127.0.0.1:3100"])(
    "accepts %s on this computer",
    (address) => {
      expect(parsePaperclipConnection(yaml(label, `address: ${address}`, company)).ok).toBe(true);
    },
  );

  it.each([
    "paperclip.example.com",
    "ftp://paperclip.example.com",
    "https://acme@paperclip.example.com",
    "https://paperclip.example.com/?company=acme",
  ])("refuses the address %s", (address) => {
    const problems = problemsOf(yaml(label, `address: "${address}"`, company));
    expect(summary(problems)).toEqual(["address paperclip-address 2"]);
  });

  it("refuses a file without a company", () => {
    const problems = problemsOf(yaml(label, "address: https://paperclip.example.com"));
    expect(summary(problems)).toEqual(["company invalid_type 1"]);
  });

  it("names the same server and company the same way, however the address is written", () => {
    const key = (address: string) =>
      paperclipConnectionKey({ label: "Acme", address, company: "acme-company-1" });
    expect(key("https://Paperclip.example.com:443/")).toBe(
      "https://paperclip.example.com acme-company-1",
    );
    expect(key("https://paperclip.example.com")).toBe(
      "https://paperclip.example.com acme-company-1",
    );
    expect(key("https://paperclip.example.com/acme/")).toBe(
      "https://paperclip.example.com/acme acme-company-1",
    );
    expect(key("http://localhost:3100")).toBe("http://localhost:3100 acme-company-1");
  });
});
