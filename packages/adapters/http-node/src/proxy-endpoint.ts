interface Credentials {
  readonly username: string;
  readonly password: string;
}

/**
 * The `http://` proxy a request goes through. The user name and password
 * live in a private field: printing the endpoint, serialising it or looking
 * at it in a debugger shows `http://host:port` only.
 */
export class ProxyEndpoint {
  /** The proxy's host as `URL` writes it: lower case, IPv6 in brackets. */
  readonly host: string;
  readonly port: number;
  readonly #credentials: Credentials | undefined;

  private constructor(host: string, port: number, credentials: Credentials | undefined) {
    this.host = host;
    this.port = port;
    this.#credentials = credentials;
  }

  /** Reads an `http://` URL with an optional user name and password, host and port; a refusal says why, without the credentials. */
  static parse(value: string): ProxyEndpointResult {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return refusal("The proxy setting is not a URL. Halonic needs it as http://host:port.");
    }
    // Without `//` after the scheme, `bob:secret@proxy:3128` reads as the scheme `bob:` with no host.
    // Say nothing of the scheme then: it is the user name.
    if (url.protocol !== "http:" && url.hostname === "") {
      return refusal("The proxy setting is not a URL. Halonic needs it as http://host:port.");
    }
    if (url.protocol !== "http:") {
      return {
        ...refusal(
          `Halonic supports an http:// proxy; yours is ${url.protocol}//${url.host}. ` +
            "Use http://host:port.",
        ),
        scheme: url.protocol.slice(0, -1),
      };
    }
    if (url.hostname === "") {
      return refusal("The proxy setting has no host. Halonic needs it as http://host:port.");
    }
    if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
      return refusal(`The proxy setting for ${url.host} has more than host and port in it.`);
    }
    const port = url.port === "" ? 80 : Number(url.port);
    if (port === 0) {
      return refusal(`The proxy setting for ${url.hostname} uses port 0.`);
    }
    const credentials = decodeCredentials(url);
    if (credentials === "malformed") {
      return refusal(
        `The user name or password in the proxy setting for ${url.host} is malformed.`,
      );
    }
    return { kind: "proxy", endpoint: new ProxyEndpoint(url.hostname, port, credentials) };
  }

  /** The `Proxy-Authorization` value for the CONNECT line, if the URL had a user name. */
  proxyAuthorization(): string | undefined {
    if (this.#credentials === undefined) {
      return undefined;
    }
    const { username, password } = this.#credentials;
    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  /** `http://host:port`, never the user name or password. */
  toString(): string {
    return `http://${this.host}:${this.port}`;
  }

  toJSON(): string {
    return this.toString();
  }
}

export type ProxyEndpointResult =
  | { readonly kind: "proxy"; readonly endpoint: ProxyEndpoint }
  | {
      readonly kind: "refused";
      readonly message: string;
      /** The scheme of a proxy that isn't `http`, such as `https` or `socks5`, for `halonic doctor` to name. */
      readonly scheme?: string;
    };

function refusal(message: string): ProxyEndpointResult & { kind: "refused" } {
  return { kind: "refused", message };
}

function decodeCredentials(url: URL): Credentials | undefined | "malformed" {
  if (url.username === "" && url.password === "") {
    return undefined;
  }
  try {
    return {
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  } catch {
    return "malformed";
  }
}
