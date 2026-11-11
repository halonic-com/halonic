# @halonicjs/adapter-http-kit

The address classes for outgoing requests: which class an IP address is in, and which addresses a
host of each class may reach. Plain code with Web types, so the integration kit, a Node transport
and the Worker can share one rule. Today only the integration kit uses it (`parseIpAddress` and
`classifyAddress`, to tell a loopback or private-network host from the rest); no Node transport
checks DNS answers with `addressAllowedFor` yet.

- **Layer:** adapters
- **Owner:** ravi
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-http-kit`

## Classes

`classifyAddress(address)` puts an IP address in exactly one class:

| Class | What it covers |
| --- | --- |
| `public` | global unicast addresses outside every block below |
| `private` | `10/8`, `172.16/12`, `192.168/16`, `fc00::/7` |
| `loopback` | `127/8`, `::1` |
| `link-local` | `169.254/16`, `fe80::/10` |
| `metadata` | cloud credential services: `169.254.169.254`, `169.254.170.2`, `100.100.100.200`, `fd00:ec2::254` |
| `unspecified` | `0/8`, `::` |
| `reserved` | carrier-grade NAT `100.64/10`, documentation, benchmark, multicast and broadcast blocks, IPv4-mapped IPv6, and NAT64 or 6to4 forms of any address that isn't public |

A NAT64 (`64:ff9b::/96`) or 6to4 (`2002::/16`) address counts as public only when the IPv4
address inside it is public.

`addressAllowedFor(host, address)` is the rule from the I5 design (HAL-958, section 3.8): a
`public` host may reach public addresses only, a `private` (home-network) host private ones
only, and a `loopback` host (this computer) loopback ones only. Check every address in a DNS
answer, not only the first.

## Transports that check addresses

`AddressCheckingHttpClient` is an `HttpClient` that checks every address a name resolves to,
on every request and redirect hop. It is a mark in the types only: the Node transport
(`createNodeHttpClient`) returns one, and the integration kit's loader takes nothing else, so a
plain `fetch` wrapper can't send an integration's requests.

## Only canonical text

`parseIpAddress` and `classifyAddress` read the text a DNS answer or `URL.hostname` gives: dotted
IPv4, and IPv6 with or without brackets. Loose IPv4 forms (`2130706433`, `0177.0.0.1`,
`0x7f000001`, `127.1`), leading zeros and IPv6 zone IDs are not addresses here, and
`classifyAddress` throws a `RangeError` for them. `URL` turns the loose forms into dotted IPv4, so
read hosts through `URL` first.

## Example

Check a DNS answer for a public host. The code lives in
[`examples/check-answer.ts`](examples/check-answer.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. Outside this package, import
`@halonicjs/adapter-http-kit`.

```ts
import { addressAllowedFor, classifyAddress } from "@halonicjs/adapter-http-kit";

/** Checks a DNS answer for a public host the way a transport should: every address, not only the first. */
export function runExample(): { allowed: string[]; refused: { address: string; class: string }[] } {
  // An answer that mixes a public address with a private and a mapped loopback one.
  const answer = ["93.184.215.14", "10.0.0.5", "::ffff:127.0.0.1"];

  const allowed = answer.filter((address) => addressAllowedFor("public", address));
  const refused = answer
    .filter((address) => !addressAllowedFor("public", address))
    .map((address) => ({ address, class: classifyAddress(address) }));

  // allowed: ["93.184.215.14"]
  // refused: 10.0.0.5 is "private", ::ffff:127.0.0.1 is "reserved"
  return { allowed, refused };
}
```
