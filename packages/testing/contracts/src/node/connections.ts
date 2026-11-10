import { Socket } from "node:net";
import { afterEach, beforeEach, expect } from "vitest";

/** A switched-on trap on TCP connections, and the addresses it refused. */
export interface ConnectionTrap {
  /** Every `host:port` refused so far, in order. */
  reached(): readonly string[];
  /** Puts the original `Socket.prototype.connect` back. */
  restore(): void;
}

/**
 * Replaces `net.Socket.prototype.connect` so that a TCP connection to
 * another machine is recorded and refused: the socket is destroyed with an
 * error instead of connecting. Every Node client opens its sockets there,
 * so this also catches `net.connect`, `tls.connect`, `http.get`,
 * `https.get`, Node's `fetch` and SDKs built on them. A connection to this
 * machine (`localhost`, `127.x.x.x`, `::1`) or to a local socket path goes
 * through, so a binding can still start a local test server.
 */
export function trapConnections(): ConnectionTrap {
  const original = Socket.prototype.connect;
  const reached: string[] = [];
  const connect = function (this: Socket, ...args: unknown[]): Socket {
    const target = connectTarget(args);
    if (target === undefined || isLoopbackHost(target.host)) {
      return (original as (...args: unknown[]) => Socket).apply(this, args);
    }
    const address = `${target.host}:${target.port}`;
    reached.push(address);
    return this.destroy(
      new Error(`A contract case reaches no network, but a socket asked for ${address}.`),
    );
  };
  Socket.prototype.connect = connect as typeof original;
  return {
    reached: () => [...reached],
    restore: () => {
      Socket.prototype.connect = original;
    },
  };
}

/**
 * Fails every case of the calling `describe`, or of the whole test file when
 * called at its top level, in which the binding opens a TCP connection to
 * another machine, also when it catches the refusal. A Node binding switches
 * it on next to its contract suites, so a CI run never makes a live call,
 * not even through `https.get` or a vendor SDK that goes past the
 * context's `http`.
 */
export function refuseRealConnections(): void {
  let trap: ConnectionTrap | undefined;

  beforeEach(() => {
    trap = trapConnections();
  });

  afterEach(() => {
    const reached = trap?.reached() ?? [];
    trap?.restore();
    trap = undefined;
    expect(reached, "the binding opened a connection to another machine").toEqual([]);
  });
}

/**
 * Where a `Socket.prototype.connect` call goes, read the way Node reads it:
 * `(options)`, `(port, host?)`, `(path)`, or the `[options, callback]` pair
 * `net.connect` passes. `undefined` for a local socket path.
 */
function connectTarget(args: readonly unknown[]): { host: string; port: string } | undefined {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof first === "object" && first !== null) {
    const options = first as { path?: unknown; host?: unknown; port?: unknown };
    if (typeof options.path === "string") return undefined;
    return { host: hostOf(options.host), port: String(options.port) };
  }
  if (typeof first === "string" && !/^\d+$/.test(first)) return undefined;
  return { host: hostOf(args[1]), port: String(first) };
}

/** Node connects to `localhost` when the host is left out or empty. */
function hostOf(host: unknown): string {
  return typeof host === "string" && host !== "" ? host : "localhost";
}

/** Whether `host` names this machine: `localhost`, `127.x.x.x` or `::1`. */
function isLoopbackHost(host: string): boolean {
  const name = host.replace(/^\[|\]$/g, "").toLowerCase();
  return name === "localhost" || name === "::1" || /^127\.\d+\.\d+\.\d+$/.test(name);
}
