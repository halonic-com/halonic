import { decodePairingQr } from "@halonicjs/ports";
import { encodeBase64url } from "@halonicjs/std";
import type {
  ComputerId,
  ComputerTunnel,
  PairingId,
  PairingOutcome,
  PairingStep,
  PhoneStatus,
  PhoneTunnel,
  TunnelPairingStart,
} from "@halonicjs/studio-feature-remote/phone";
import {
  type TauriCallbacks,
  type TauriIpc,
  tauriChannelIpc,
} from "@halonicjs/studio-services/tauri-ipc";
import {
  type Report,
  readComputers,
  readConnect,
  readForget,
  readPairingOutcome,
  readPairingStep,
} from "./phone-tunnel-answers.ts";
import { TauriComputerTunnel } from "./tauri-computer-tunnel.ts";
import { TunnelEvents } from "./tunnel-events.ts";

type StatusListener = (computer: ComputerId, status: PhoneStatus) => void;

/**
 * The phone's tunnel for the Android app: each call goes to the shell's `phone_*` commands
 * (`src-tauri/src/phone_tunnel.rs`, granted to the phone's own page by
 * `capabilities/phone-tunnel.json`), and the keys stay there. The page hands over only the
 * code, the QR code's public host key and the endpoints, and gets back ids, names, the check
 * code and states.
 *
 * - **One pairing:** the shell keeps one pairing, without an id. The adapter names each start,
 *   and a wait or a cancel for a pairing a newer start replaced doesn't reach the shell, so it
 *   can't end the newer one.
 * - **Statuses:** from the page's one watch channel (`TunnelEvents`), which the gateway
 *   clients from {@link TauriPhoneTunnel.computerTunnel} share; a later listener gets the
 *   latest ones first.
 * - **Answers** are read with `phone-tunnel-answers.ts`; one the page doesn't know goes to
 *   `report`. A call the shell refuses rejects, as the port's callers expect.
 */
export class TauriPhoneTunnel implements PhoneTunnel {
  readonly #ipc: TauriIpc & TauriCallbacks;
  readonly #report: Report;
  readonly #events: TunnelEvents;
  #pairings = 0;
  #pairing: PairingId | undefined;

  constructor(ipc: TauriIpc & TauriCallbacks, report: Report) {
    this.#ipc = ipc;
    this.#report = report;
    this.#events = new TunnelEvents(ipc, report);
  }

  async startPairing(start: TunnelPairingStart): Promise<PairingStep> {
    const shellStart = shellPairingStart(start);
    if (shellStart === undefined) return { kind: "bad-start" };
    this.#pairings += 1;
    const pairing = `pairing-${this.#pairings}` as PairingId;
    // The shell ends any pairing before this one when it starts.
    this.#pairing = pairing;
    const answer = await this.#ipc.invoke("phone_pair_start", { start: shellStart });
    return readPairingStep(answer, pairing, this.#report);
  }

  async waitForAllow(pairing: PairingId): Promise<PairingOutcome> {
    if (pairing !== this.#pairing) return { kind: "code-ended" };
    const answer = await this.#ipc.invoke("phone_pair_wait");
    if (this.#pairing === pairing) this.#pairing = undefined;
    return readPairingOutcome(answer, this.#report);
  }

  async cancelPairing(pairing: PairingId): Promise<void> {
    if (pairing !== this.#pairing) return;
    this.#pairing = undefined;
    await this.#ipc.invoke("phone_pair_cancel");
  }

  async pairedComputers() {
    return readComputers(await this.#ipc.invoke("phone_computers"), this.#report);
  }

  async forget(computer: ComputerId) {
    return readForget(await this.#ipc.invoke("phone_forget", { computer }), this.#report);
  }

  async connect(computer: ComputerId) {
    return readConnect(await this.#ipc.invoke("phone_connect", { computer }), this.#report);
  }

  async disconnect(computer: ComputerId): Promise<void> {
    await this.#ipc.invoke("phone_disconnect", { computer });
  }

  onStatus(listener: StatusListener): () => void {
    return this.#events.listen((event) => {
      if (event.kind === "status") listener(event.computer, event.status);
    });
  }

  /** The gateway client's tunnel to `computer`, on the same watch channel as the statuses. */
  computerTunnel(computer: ComputerId): ComputerTunnel {
    return new TauriComputerTunnel(this.#ipc, this.#events, computer, this.#report);
  }
}

/**
 * The phone's tunnel in the Android app, or `undefined` when the page isn't running in the shell
 * (for example while working on it in a browser).
 *
 * @param page - the page's global object, usually `window`
 * @param report - where an answer the page doesn't know goes, for the log
 */
export function tauriPhoneTunnel(page: object, report: Report): PhoneTunnel | undefined {
  const ipc = tauriChannelIpc(page);
  return ipc === undefined ? undefined : new TauriPhoneTunnel(ipc, report);
}

/** The shell's `PairingStart`; `again` is the computer the person chose Pair again on. */
type ShellPairingStart =
  | {
      readonly route: "qr";
      readonly hostKey: string;
      readonly code: string;
      readonly endpoints: readonly string[];
      readonly again?: string;
    }
  | {
      readonly route: "typed";
      readonly code: string;
      readonly endpoints: readonly string[];
      readonly again?: string;
    };

/**
 * What the shell starts from: a scanned text is decoded here with `decodePairingQr`, and the
 * shell reads the code, the key and the endpoints again. A text that doesn't decode is
 * `undefined`, which the port answers as `bad-start`.
 */
export function shellPairingStart(start: TunnelPairingStart): ShellPairingStart | undefined {
  const again = start.again === undefined ? {} : { again: start.again };
  if (start.route === "typed") {
    return {
      route: "typed",
      code: start.code,
      endpoints: [typedEndpoint(start.endpoint)],
      ...again,
    };
  }
  const payload = decodePairingQr(start.scanned);
  if (payload === undefined) return undefined;
  return {
    route: "qr",
    hostKey: encodeBase64url(payload.hostKey),
    code: payload.code,
    endpoints: payload.endpoints,
    ...again,
  };
}

/**
 * The typed route's computer as an endpoint: a computer paired before keeps its endpoint URL,
 * and one found on this Wi-Fi is `host:port`, reached over plain `tcp:` on the LAN.
 */
function typedEndpoint(endpoint: string): string {
  return endpoint.includes("://") ? endpoint : `tcp://${endpoint}`;
}
