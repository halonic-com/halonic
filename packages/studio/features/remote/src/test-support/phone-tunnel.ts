import type {
  ComputerId,
  ConnectOutcome,
  ForgetOutcome,
  KeysUnavailable,
  ListedComputer,
  PairedComputer,
  PairingId,
  PairingOutcome,
  PairingStep,
  PhoneStatus,
  PhoneTunnel,
  TunnelPairingStart,
} from "../phone/phone-tunnel.ts";

type Listener = (computer: ComputerId, status: PhoneStatus) => void;

/**
 * An in-memory {@link PhoneTunnel} for the phone screens' tests. A test sets what the next
 * pairing answers, and pushes statuses with {@link FakePhoneTunnel.push}. It keeps the shell's
 * rules the screens rely on: a new listener gets each computer's current status, a re-pair
 * keeps the computer's id, and only `forget` deletes an entry.
 */
export class FakePhoneTunnel implements PhoneTunnel {
  readonly computers = new Map<ComputerId, ListedComputer>();
  /** False makes the calls that need the phone's key storage answer `keys-unavailable`. */
  keysWork = true;
  readonly started: TunnelPairingStart[] = [];
  readonly calls: string[] = [];
  nextStep: PairingStep = {
    kind: "check",
    pairing: "pairing-1" as PairingId,
    checkCode: "4F72KQ",
    computerName: "Tim's laptop",
  };
  nextOutcome: PairingOutcome | "paired" = "paired";
  private readonly statuses = new Map<ComputerId, PhoneStatus>();
  private readonly listeners = new Set<Listener>();
  private start: TunnelPairingStart | undefined;

  async startPairing(start: TunnelPairingStart): Promise<PairingStep> {
    this.started.push(start);
    this.start = start;
    return this.nextStep;
  }

  async waitForAllow(_pairing: PairingId): Promise<PairingOutcome> {
    if (this.nextOutcome !== "paired") return this.nextOutcome;
    const id = this.start?.again ?? (`computer-${this.computers.size + 1}` as ComputerId);
    const computer: PairedComputer = {
      id,
      name: this.nextStep.kind === "check" ? this.nextStep.computerName : "Tim's laptop",
      pairedAt: "2026-11-14T14:02:00Z",
      endpoints: this.endpoints(),
      standing: "paired",
    };
    this.computers.set(id, computer);
    return { kind: "paired", computer };
  }

  /**
   * A typed start's endpoint, as the shell saves it. A `nearby` start's address is the shell's,
   * so the fake makes one up from the id.
   */
  private endpoints(): string[] {
    if (this.start?.route !== "typed") return [];
    return "nearby" in this.start ? [`tcp://${this.start.nearby}.lan:4100`] : [this.start.endpoint];
  }

  async cancelPairing(pairing: PairingId): Promise<void> {
    this.calls.push(`cancel ${pairing}`);
  }

  async pairedComputers(): Promise<readonly ListedComputer[] | KeysUnavailable> {
    if (!this.keysWork) return { kind: "keys-unavailable" };
    return [...this.computers.values()];
  }

  async forget(computer: ComputerId): Promise<ForgetOutcome> {
    if (!this.keysWork) return { kind: "keys-unavailable" };
    this.computers.delete(computer);
    this.statuses.delete(computer);
    return { kind: "forgotten" };
  }

  async connect(computer: ComputerId): Promise<ConnectOutcome> {
    this.calls.push(`connect ${computer}`);
    return { kind: this.computers.has(computer) ? "connecting" : "not-paired" };
  }

  async disconnect(computer: ComputerId): Promise<void> {
    this.calls.push(`disconnect ${computer}`);
  }

  onStatus(listener: Listener): () => void {
    this.listeners.add(listener);
    for (const [computer, status] of this.statuses) listener(computer, status);
    return () => this.listeners.delete(listener);
  }

  /** Sends a status as the shell would. `removed` marks the entry removed and keeps it. */
  push(computer: ComputerId, status: PhoneStatus): void {
    const entry = this.computers.get(computer);
    const marks = status.state === "removed" || status.state === "cant-confirm";
    if (entry !== undefined && entry.standing !== "unreadable" && marks) {
      this.computers.set(computer, {
        ...entry,
        standing: status.state === "removed" ? "removed" : "cant-confirm",
      });
    }
    this.statuses.set(computer, status);
    for (const listener of this.listeners) listener(computer, status);
  }
}
