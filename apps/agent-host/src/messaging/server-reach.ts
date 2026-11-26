/** Whether the host's last call to a workspace's server got through, and when it ended. */
export interface Reach {
  state: "online" | "offline";
  /** When that call ended, ISO 8601 in UTC; the page shows it in local time. */
  asOf: string;
}

/** How a server's client sends a request. */
export type ServerSend = (request: Request) => Promise<Response>;

/**
 * What the host last heard from one joined server (`agent-host.server-engine-pairing`).
 * Each joined engine gets its own, so switching or pairing again starts with
 * none, and a slow answer to the engine before can't change the new one's.
 */
export class ServerReach {
  readonly #now: () => Date;
  #last: Reach | undefined;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  /** The last call's outcome, or `undefined` before the first call ended. */
  get last(): Reach | undefined {
    return this.#last;
  }

  /**
   * `send`, noting each call: a failed request (the network, a timeout, an
   * abort) or a 5xx is offline, a 2xx is online. Any other answer leaves it
   * as it was: a 401 or 403 is the pairing's own state, and a 404 or 429
   * reached the server without the call working.
   */
  watch(send: ServerSend): ServerSend {
    return async (request) => {
      let response: Response;
      try {
        response = await send(request);
      } catch (error) {
        this.#note("offline");
        throw error;
      }
      if (response.status >= 500) this.#note("offline");
      else if (response.ok) this.#note("online");
      return response;
    };
  }

  #note(state: Reach["state"]): void {
    this.#last = { state, asOf: this.#now().toISOString() };
  }
}
