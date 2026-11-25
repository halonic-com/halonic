import {
  type GatewayListener,
  type GatewayPolicy,
  startGatewayListener,
} from "@halonicjs/adapter-remote-gateway";
import type { RunTable } from "../harness/run-table.ts";
import type { GatewaySwitch } from "../remote/host-remote-control.ts";
import type { GatewayAccess } from "./desk-access.ts";
import { hostGatewaySource } from "./host-gateway-source.ts";
import type { RunLedger } from "./run-ledger.ts";

/**
 * The person's "Let phones answer risky approvals" switch, read again for
 * every answer a phone sends, so turning it off takes effect at once. The
 * `answersRisky` in the phones' session list only tells them what to show;
 * this check is the gate.
 */
export interface RiskySwitch {
  allowRiskyRemotely(): boolean;
}

/** The switch while nothing sets it: off, as the setting is by default. */
export const riskyOff: RiskySwitch = { allowRiskyRemotely: () => false };

/** The gateway's policy, which asks the switch again for every answer. */
export function gatewayPolicy(risky: RiskySwitch): GatewayPolicy {
  return { allowRiskyRemotely: () => risky.allowRiskyRemotely() };
}

/** What a {@link RemoteGateway} serves, and to whom. */
export interface RemoteGatewayOptions {
  /** The runs the host recorded for the gateway to show. */
  readonly ledger: RunLedger;
  readonly runs: RunTable;
  /**
   * The host's pairing desk and paired phones (`agent-host.remote-gateway-access`),
   * asked for at each start: they need the host key, which the keychain gives
   * only once the host serves.
   */
  readonly access: () => Promise<GatewayAccess>;
  readonly risky: RiskySwitch;
  /** The loopback port to listen on; a free one each time when not given. */
  readonly port?: number;
  /** The `Host` a request through the tunnel carries, asked for at each start; loopback names only when not given. */
  readonly tunnelHosts?: () => Promise<readonly string[]>;
  /** Headers the tunnel adds only to a public request; the listener refuses a request with one. */
  readonly publicHeaders?: readonly string[];
  /** The ports the host listens on, which no provider's address may be: the gateway's joins while it listens. */
  readonly ownPorts: Set<number>;
  /** Where a listener that can't start, and a connection that fails, is reported; the host serves on. */
  readonly log: (text: string) => void;
}

/**
 * The host's remote gateway (requirement `agent-host.remote-gateway`): a
 * listener on loopback that runs only while remote is on, so the host's
 * `RemoteControl` starts it when remote turns on and stops it when remote
 * turns off or the host stops. Starts and stops take effect in the order
 * they were called, so the last one called decides whether it listens.
 */
export class RemoteGateway implements GatewaySwitch {
  readonly #options: RemoteGatewayOptions;
  #listener: GatewayListener | undefined;
  /** The start or stop running now; the next one waits for it. */
  #turn: Promise<unknown> = Promise.resolve();

  constructor(options: RemoteGatewayOptions) {
    this.#options = options;
  }

  /**
   * Starts the listener, or keeps the one already running.
   *
   * @returns the port it listens on, `undefined` when it couldn't start (and said why)
   */
  start(): Promise<number | undefined> {
    return this.#inTurn(async () => {
      this.#listener ??= await this.#listen();
      if (this.#listener !== undefined) this.#options.ownPorts.add(this.#listener.port);
      return this.#listener?.port;
    });
  }

  /** Sends every connected phone the session list again, as after the risky switch changed. */
  listAgain(): void {
    this.#listener?.listAgain();
  }

  /** Closes the listener, if one runs. */
  stop(): Promise<void> {
    return this.#inTurn(async () => {
      const listener = this.#listener;
      if (listener === undefined) return;
      this.#listener = undefined;
      await listener.close();
      this.#options.ownPorts.delete(listener.port);
    });
  }

  async #listen(): Promise<GatewayListener | undefined> {
    const { ledger, runs, risky, port, publicHeaders, log } = this.#options;
    try {
      const { phones, pairing } = await this.#options.access();
      const extraHosts = await this.#tunnelHosts();
      return await startGatewayListener({
        source: hostGatewaySource(ledger, runs),
        phones,
        pairing,
        policy: gatewayPolicy(risky),
        onError: (error) => log(`A remote gateway connection failed: ${String(error)}\n`),
        ...(port === undefined ? {} : { port }),
        extraHosts,
        ...(publicHeaders === undefined ? {} : { publicHeaders }),
      });
    } catch (error) {
      log(`The remote gateway didn't start: ${String(error)}\n`);
      return undefined;
    }
  }

  /** The tunnel's names for this start; none, said why, when they can't be read, so only loopback names pass. */
  async #tunnelHosts(): Promise<readonly string[]> {
    try {
      return (await this.#options.tunnelHosts?.()) ?? [];
    } catch (error) {
      this.#options.log(`The remote gateway accepts no tunnel name: ${String(error)}\n`);
      return [];
    }
  }

  #inTurn<T>(work: () => Promise<T>): Promise<T> {
    const next = this.#turn.then(work);
    this.#turn = next.catch(() => undefined);
    return next;
  }
}
