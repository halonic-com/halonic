import { type GatewayListener, startGatewayListener } from "@halonicjs/adapter-remote-gateway";
import type { RunTable } from "../harness/run-table.ts";
import type { GatewaySettings } from "./gateway-settings.ts";
import { hostGatewaySource } from "./host-gateway-source.ts";
import { NobodyPaired } from "./nobody-paired.ts";
import type { RunLedger } from "./run-ledger.ts";

/**
 * The host's remote gateway: starts the listener when the setting turns it on
 * and closes it again (requirement `agent-host.remote-gateway`). Without a
 * ledger, which the host makes only when the gateway is on, it stays off.
 */
export class RemoteGateway {
  #listener: GatewayListener | undefined;

  readonly #settings: GatewaySettings;
  readonly #ledger: RunLedger | undefined;
  readonly #runs: RunTable;

  constructor(settings: GatewaySettings, ledger: RunLedger | undefined, runs: RunTable) {
    this.#settings = settings;
    this.#ledger = ledger;
    this.#runs = runs;
  }

  /**
   * Starts the listener, or does nothing when the setting is off. A listener
   * that can't start, and a connection that fails, is told to `log`; the host
   * serves on.
   *
   * @returns the port it listens on, `undefined` when it isn't listening
   */
  async start(log: (text: string) => void): Promise<number | undefined> {
    if (!this.#settings.enabled || this.#ledger === undefined) return undefined;
    try {
      const nobodyPaired = new NobodyPaired();
      this.#listener = await startGatewayListener({
        source: hostGatewaySource(this.#ledger, this.#runs),
        phones: nobodyPaired,
        pairing: nobodyPaired,
        // A phone may not answer a risky approval until the person allows it on this desktop; nothing sets that yet.
        policy: { allowRiskyRemotely: () => false },
        onError: (error) => log(`A remote gateway connection failed: ${String(error)}\n`),
        ...(this.#settings.port === undefined ? {} : { port: this.#settings.port }),
      });
      return this.#listener.port;
    } catch (error) {
      log(`The remote gateway didn't start: ${String(error)}\n`);
      return undefined;
    }
  }

  async close(): Promise<void> {
    await this.#listener?.close();
  }
}
