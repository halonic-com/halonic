// URL-shaped text built from parts that each hit a rule of the URL standard:
// schemes, slashes, user info, hosts (names, IPv4 in every form, IPv6),
// ports, paths and whitespace around it. Hosts are ASCII only: non-ASCII
// hosts are the one documented gap (requirement schema-kit.string-url).
import fc from "fast-check";

const scheme = fc.constantFrom(
  "http",
  "https",
  "HTTP",
  "ws",
  "wss",
  "ftp",
  "file",
  "mailto",
  "foo",
  "a+b.c-d",
  "1http",
  "",
  "h ttp",
);

const separator = fc.constantFrom(":", "://", ":/", ":\\\\", ":///", "", "://\\", ":\\/");

const userInfo = fc.constantFrom("", "", "", "user@", "user:pass@", "@", "a@b@", ":@", "us%40er@");

const domain = fc.constantFrom(
  "example.com",
  "EXAMPLE.com",
  "localhost",
  "a",
  "a.",
  ".",
  "a..b",
  "xn--bcher-kva.de",
  "my_host",
  "exa mple.com",
  "a<b",
  "a^b",
  "a|b",
  "a%41b",
  "a%2Fb",
  "a%zzb",
  "a%",
  "a%00b",
  "a%C3%BCb",
  "a\\b",
  "a*b",
  "",
);

const ipv4 = fc.constantFrom(
  "1.2.3.4",
  "1.2.3.4.",
  "0x7f.1",
  "0x7F.0.0.1",
  "0x",
  "0xg",
  "256.1.1.1",
  "1.2.3.256",
  "1.2.65536",
  "1.2.3",
  "4294967295",
  "4294967296",
  "999999999999",
  "1..2",
  "08",
  "07",
  "1.2.3.4.5",
  "a.1",
  "1.a",
);

const ipv6 = fc.constantFrom(
  "[::1]",
  "[::]",
  "[1:2:3:4:5:6:7:8]",
  "[1:2:3:4:5:6:7:8:9]",
  "[::ffff:1.2.3.4]",
  "[::ffff:1.2.3.04]",
  "[::1.2.3]",
  "[1::2::3]",
  "[:1]",
  "[1:]",
  "[::1",
  "[12345::]",
  "[1:2:3:4:5:6:1.2.3.4]",
  "[1:2:3:4:5:6:7:1.2.3.4]",
  "[::g]",
  "[]",
);

const port = fc.constantFrom(
  "",
  "",
  "",
  ":",
  ":80",
  ":0080",
  ":65535",
  ":65536",
  ":x1",
  ":8a",
  ":99999999999",
);

const rest = fc.constantFrom("", "/", "/path", "?q=1", "#frag", "/a b", "\\x", "/@/:");

// Built from code points: the formatter would turn escapes into invisible characters.
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);
const EM_SPACE = String.fromCodePoint(0x2003);

const padding = fc.constantFrom("", "", "", " ", "\t", "\n", "\u0001", NO_BREAK_SPACE, EM_SPACE);

/** A URL-like text, valid or not. */
export const urlLikeText: fc.Arbitrary<string> = fc
  .tuple(padding, scheme, separator, userInfo, fc.oneof(domain, ipv4, ipv6), port, rest, padding)
  .map((parts) => parts.join(""));
