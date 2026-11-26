import type {
  ServerEngine,
  ServerEngineLeft,
  ServerEngineView,
  ServerPairStart,
  ServerPairState,
} from "@halonicjs/studio-services";

/** One answer the fake gives: a value, or a rejection with this error. */
type Answer<Value> = Value | { readonly reject: Error };

/** What the fake answers, each settable by the test; every call is recorded. */
export interface FakeServerEngineAnswers {
  state?: Answer<ServerEngineView>;
  pair?: Answer<ServerPairStart>;
  /** Answered in turn; the last one repeats. */
  status?: readonly Answer<ServerPairState>[];
  cancel?: Answer<boolean>;
  left?: Answer<ServerEngineLeft>;
}

const waiting = {
  state: "waiting",
  pairingId: "pairing-1",
  checkCode: "4F72KQ",
  expiresAt: "2026-11-24T14:10:00.000Z",
} as const;

function settle<Value>(answer: Answer<Value>): Promise<Value> {
  if (typeof answer === "object" && answer !== null && "reject" in answer) {
    return Promise.reject(answer.reject);
  }
  return Promise.resolve(answer);
}

/** A server engine for tests: answers what the test set and records what the page asked. */
export class FakeServerEngine implements ServerEngine {
  readonly answers: FakeServerEngineAnswers;
  readonly calls: string[] = [];
  readonly pairs: { address: string; code: string; deviceName: string }[] = [];
  #statusAt = 0;

  constructor(answers: FakeServerEngineAnswers = {}) {
    this.answers = answers;
  }

  state(): Promise<ServerEngineView> {
    this.calls.push("state");
    return settle(this.answers.state ?? { engine: "this-computer" });
  }

  pair(address: string, code: string, deviceName: string): Promise<ServerPairStart> {
    this.calls.push("pair");
    this.pairs.push({ address, code, deviceName });
    return settle(this.answers.pair ?? waiting);
  }

  status(pairingId: string): Promise<ServerPairState> {
    this.calls.push(`status ${pairingId}`);
    const list = this.answers.status ?? [{ state: "waiting", expiresAt: waiting.expiresAt }];
    const answer = list[Math.min(this.#statusAt, list.length - 1)];
    this.#statusAt++;
    return answer === undefined ? Promise.reject(new Error("no status")) : settle(answer);
  }

  cancel(pairingId: string): Promise<boolean> {
    this.calls.push(`cancel ${pairingId}`);
    return settle(this.answers.cancel ?? true);
  }

  useThisComputer(): Promise<ServerEngineLeft> {
    this.calls.push("useThisComputer");
    return settle(this.answers.left ?? { stillValid: false });
  }
}
