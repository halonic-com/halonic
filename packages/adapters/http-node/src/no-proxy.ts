/** One entry of a `NO_PROXY` list. */
type NoProxyRule =
  | { readonly kind: "everything" }
  | {
      readonly kind: "host";
      /** Lower case, no brackets, no trailing dot. */
      readonly host: string;
      /** An IP literal matches itself only; a name also matches its subdomains. */
      readonly isIpLiteral: boolean;
      readonly port: number | undefined;
    };

/** Which hosts go straight to the network instead of through the proxy. */
export class NoProxy {
  readonly #rules: readonly NoProxyRule[];

  private constructor(rules: readonly NoProxyRule[]) {
    this.#rules = rules;
  }

  /**
   * Reads a `NO_PROXY` value: comma-separated, case-insensitive. `*` means
   * everything; a name matches itself and its subdomains (`example.com` and
   * `.example.com` alike); `:port` narrows an entry; an IP literal matches
   * exactly. There are no address ranges. An entry that can't be understood
   * is dropped, so its host goes through the proxy.
   */
  static parse(value: string | undefined): NoProxy {
    const rules: NoProxyRule[] = [];
    for (const entry of (value ?? "").split(",")) {
      const rule = parseRule(entry.trim().toLowerCase());
      if (rule !== undefined) {
        rules.push(rule);
      }
    }
    return new NoProxy(rules);
  }

  /** Whether the URL's host is on the list. */
  matches(url: URL): boolean {
    const host = withoutBrackets(url.hostname).replace(/\.$/, "");
    const port = Number(url.port) || defaultPort(url.protocol);
    return this.#rules.some((rule) => ruleMatches(rule, host, port));
  }
}

function parseRule(entry: string): NoProxyRule | undefined {
  if (entry === "") {
    return undefined;
  }
  if (entry === "*") {
    return { kind: "everything" };
  }
  const { hostPart, portPart } = splitPort(entry);
  const port = portPart === undefined ? undefined : Number(portPart);
  if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) {
    return undefined;
  }
  const host = withoutBrackets(hostPart)
    .replace(/^\*?\./, "")
    .replace(/\.$/, "");
  if (host === "") {
    return undefined;
  }
  if (host.includes(":")) {
    const canonical = canonicalIpv6(host);
    return canonical === undefined
      ? undefined
      : { kind: "host", host: canonical, isIpLiteral: true, port };
  }
  return { kind: "host", host, isIpLiteral: /^\d+\.\d+\.\d+\.\d+$/.test(host), port };
}

/** Splits `host:port`, `[v6]:port`, a bare `v6` and a bare `host`. */
function splitPort(entry: string): { hostPart: string; portPart: string | undefined } {
  const bracketed = /^(\[[^\]]*\])(?::(\d+))?$/.exec(entry);
  if (bracketed !== null) {
    return { hostPart: bracketed[1] ?? "", portPart: bracketed[2] };
  }
  const colons = entry.split(":").length - 1;
  if (colons === 1) {
    const [hostPart = "", portPart] = entry.split(":");
    return { hostPart, portPart };
  }
  return { hostPart: entry, portPart: undefined };
}

function ruleMatches(rule: NoProxyRule, host: string, port: number): boolean {
  if (rule.kind === "everything") {
    return true;
  }
  if (rule.port !== undefined && rule.port !== port) {
    return false;
  }
  if (host === rule.host) {
    return true;
  }
  return !rule.isIpLiteral && host.endsWith(`.${rule.host}`);
}

function withoutBrackets(host: string): string {
  return host.replace(/^\[|\]$/g, "");
}

/** The form `URL` gives an IPv6 host, so two spellings of one address compare equal. */
function canonicalIpv6(address: string): string | undefined {
  try {
    return withoutBrackets(new URL(`http://[${address}]/`).hostname);
  } catch {
    return undefined;
  }
}

function defaultPort(protocol: string): number {
  return protocol === "https:" ? 443 : 80;
}
