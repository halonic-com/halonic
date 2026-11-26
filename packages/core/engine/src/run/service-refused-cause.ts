// A failed integration call's `service-refused` cause, from Halonic's own
// log of that call's requests (HAL-19185, plan HAL-19172 section 2.2, with
// Liam's rules). Never from the integration's message or the reply: the
// requests hold only method, host, path, status and Halonic's refusal code.

import { maxServiceRetries, type ServiceRefusal, type ToolFailureCause } from "@halonicjs/events";
import type { ConnectorCallRequest } from "@halonicjs/ports";
import { twoPartEndings } from "./two-part-endings.ts";

/** What a refused call logs: its cause, and whether it may have done its work. */
export interface ServiceRefusedCall {
  readonly cause: Extract<ToolFailureCause, { code: "service-refused" }>;
  /**
   * `error` when no earlier request of the call that could change something
   * got through, so the call didn't do its work; else `unknown`.
   */
  readonly outcome: "error" | "unknown";
}

/**
 * The `service-refused` cause of a failed call whose requests are
 * `requests`, oldest first, or `undefined` when the call's last request
 * wasn't refused: a 401, 403 or 429 from the service, or the kit refusing a
 * host the sheet doesn't declare. A refusal before a later request doesn't
 * count, because the later one is what the call ended on.
 *
 * @example
 * serviceRefusedOf([{ method: "GET", host: "api.example.com", path: "/v1", status: 429 }]);
 * // => { cause: { code: "service-refused", why: "slow-down", retries: 0, sentOnce: true }, outcome: "error" }
 */
export function serviceRefusedOf(
  requests: readonly ConnectorCallRequest[] | undefined,
): ServiceRefusedCall | undefined {
  const last = requests?.at(-1);
  if (requests === undefined || last === undefined) return undefined;
  const refusal = refusalOf(last);
  if (refusal === undefined) return undefined;
  const earlier = requests.slice(0, -1);
  return {
    cause: {
      code: "service-refused",
      ...refusal,
      ...(sentNothingTwice(requests) ? { sentOnce: true } : {}),
    },
    outcome: earlier.some(changeGotThrough) ? "unknown" : "error",
  };
}

/** Why the service, or the kit, refused `request`, or `undefined` when it didn't. */
function refusalOf(request: ConnectorCallRequest): ServiceRefusal | undefined {
  if (request.refusal === "host-not-allowed") {
    const host = hostMainPart(request.host);
    return host === "" ? undefined : { why: "host-not-declared", host };
  }
  switch (request.status) {
    case 401:
      return { why: "not-accepted" };
    case 403:
      return { why: "not-allowed" };
    case 429:
      return { why: "slow-down", retries: Math.min(request.retry ?? 0, maxServiceRetries) };
    default:
      return undefined;
  }
}

/** Methods that only read, so sending them twice or having them go through changes nothing. */
const readMethods = new Set(["GET", "HEAD"]);

function mayChange(request: ConnectorCallRequest): boolean {
  return !readMethods.has(request.method.toUpperCase());
}

/** A request that may change something, and that the service accepted (2xx) or moved on (3xx). */
function changeGotThrough(request: ConnectorCallRequest): boolean {
  return (
    mayChange(request) &&
    request.status !== undefined &&
    request.status >= 200 &&
    request.status < 400
  );
}

/**
 * Whether no request that may change something went out twice in the call:
 * the same method to the same host and path. A request the kit refused
 * never went out, so it doesn't count.
 */
function sentNothingTwice(requests: readonly ConnectorCallRequest[]): boolean {
  const sent = new Set<string>();
  for (const request of requests) {
    if (!mayChange(request) || request.refusal !== undefined) continue;
    const key = `${request.method.toUpperCase()} ${request.host} ${request.path}`;
    if (sent.has(key)) return false;
    sent.add(key);
  }
  return true;
}

/** An IPv4 address, or an IPv6 address as a URL writes it, in brackets. */
const addressPattern = /^\d{1,3}(\.\d{1,3}){3}$|^\[[0-9a-f:.]+\]$/i;

/**
 * The main part of a host, as a person may see it: its last two labels, or
 * three under a two-part ending such as `co.uk` ({@link twoPartEndings}),
 * so `shopify.com.example.net` reads as `example.net` and can't pass for
 * Shopify. An address and `localhost` stay as they are. An internationalised
 * host stays in the `xn--` form the kit logs it in, never decoded, so two
 * hosts that look alike can't read the same.
 *
 * @example
 * hostMainPart("shopify.com.example.net"); // => "example.net"
 * hostMainPart("api.example.co.uk"); // => "example.co.uk"
 */
export function hostMainPart(host: string): string {
  const name = host.toLowerCase().replace(/\.$/, "");
  if (name === "localhost" || addressPattern.test(name)) return name;
  const labels = name.split(".");
  const ending = labels.slice(-2).join(".");
  const kept = twoPartEndings.has(ending) ? 3 : 2;
  return labels.slice(-kept).join(".");
}
