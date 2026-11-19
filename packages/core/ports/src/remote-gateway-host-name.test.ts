import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  gatewayFallbackHostName,
  gatewayHostName,
  gatewayMaxNameBytes,
} from "./remote-gateway-session.ts";

const at = (point: number) => String.fromCodePoint(point);
const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

/**
 * The phone's rule, written again from the tunnel crate's `is_plain_name`
 * rather than shared with the code under test: Rust's `char::is_control`
 * (U+0000 to U+001F, U+007F to U+009F), the layout controls and the
 * invisible characters, and at most 64 bytes.
 */
function phoneReads(name: string): boolean {
  const refused = (point: number) =>
    point <= 0x1f ||
    (point >= 0x7f && point <= 0x9f) ||
    [0x061c, 0x200b, 0x200e, 0x200f, 0xfeff].includes(point) ||
    (point >= 0x2028 && point <= 0x202e) ||
    (point >= 0x2060 && point <= 0x2064) ||
    (point >= 0x2066 && point <= 0x2069);
  return (
    name.isWellFormed() &&
    utf8Bytes(name) <= 64 &&
    [...name].every((character) => !refused(character.codePointAt(0) ?? 0))
  );
}

verifies("ports.remote-gateway-host-name", () => {
  it.each([
    ["Desk\nPrinter", "DeskPrinter"],
    [`Desk${at(0x202e)}kseD`, "DeskkseD"],
    [`${at(0x2067)}Desk`, "Desk"],
    [`De${at(0x200b)}sk`, "Desk"],
    [`${at(0xfeff)}Desk`, "Desk"],
    [`Acme${at(0x2028)}s${at(0x061c)} laptop${at(0x7f)}${at(0x85)}`, "Acmes laptop"],
  ])("drops what the phone refuses from %j", (name, sent) => {
    expect(gatewayHostName(name)).toBe(sent);
  });

  it.each(["مكتب", `می${at(0x200c)}خواهم`, `👩${at(0x200d)}💻 desk`, "Acme's MacBook Pro"])(
    "keeps %j as it is",
    (name) => {
      expect(gatewayHostName(name)).toBe(name);
    },
  );

  it("cuts a long name at a whole code point to 64 bytes", () => {
    expect(gatewayMaxNameBytes).toBe(64);
    expect(gatewayHostName("d".repeat(65))).toBe("d".repeat(64));
    // 21 three-byte characters are 63 bytes: a 22nd doesn't fit.
    expect(gatewayHostName("机".repeat(30))).toBe("机".repeat(21));
    // A four-byte emoji after 62 bytes doesn't fit, and isn't cut in half.
    expect(gatewayHostName(`${"d".repeat(62)}💻`)).toBe("d".repeat(62));
    expect(gatewayHostName(`${"d".repeat(60)}💻`)).toBe(`${"d".repeat(60)}💻`);
    // A cut that ends on a space doesn't send the space.
    expect(gatewayHostName(`${"d".repeat(63)} desk`)).toBe("d".repeat(63));
  });

  it.each(["", "   ", "\n\t", `${at(0x200b)}${at(0xfeff)}`, ` ${at(0x202e)} `])(
    "sends the fallback name for %j",
    (name) => {
      expect(gatewayFallbackHostName).toBe("Computer");
      expect(gatewayHostName(name)).toBe("Computer");
    },
  );

  it("sends a lone surrogate as U+FFFD", () => {
    expect(gatewayHostName("Desk\ud800")).toBe("Desk�");
  });

  it("sends a name the phone reads, whatever the host is called", () => {
    // Every code point the phone refuses, the ones next to them, and long
    // names, mixed with plain letters.
    const points = [
      0x00, 0x09, 0x0a, 0x1f, 0x20, 0x41, 0x7e, 0x7f, 0x9f, 0xa0, 0xad, 0x061b, 0x061c, 0x200a,
      0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2027, 0x2028, 0x202e, 0x202f, 0x205f, 0x2060,
      0x2064, 0x2065, 0x2066, 0x2069, 0x206a, 0x673a, 0xfeff, 0x1f4bb, 0xd800,
    ];
    let seed = 7;
    for (let round = 0; round < 500; round += 1) {
      let name = "";
      const length = round % 90;
      for (let index = 0; index < length; index += 1) {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        name += at(points[seed % points.length] ?? 0x41);
      }
      const sent = gatewayHostName(name);
      expect(phoneReads(sent), JSON.stringify(sent)).toBe(true);
      expect(sent).toBe(sent.trim());
      expect(sent.length).toBeGreaterThan(0);
    }
  });
});
