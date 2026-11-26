import type {
  AgentMessaging,
  Coordination,
  ScheduledTimer,
  Scheduler,
  SchedulerListener,
} from "@halonicjs/ports";
import { RouteAgentMessaging, signedIn } from "./messaging-client.test-helper.ts";
import { MessagingPollLoop } from "./messaging-poll-loop.ts";
import { polledMessagingPorts } from "./polled-messaging.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

/**
 * A scheduler on a test clock: {@link FakeScheduler.pass} moves the clock forward and delivers
 * each timer when its time comes, one at a time, as a real scheduler would.
 */
export class FakeScheduler implements Scheduler {
  readonly #timers = new Map<string, ScheduledTimer>();
  readonly #clock: TestClock;
  #listener: SchedulerListener | undefined;
  closed = false;

  constructor(clock: TestClock) {
    this.#clock = clock;
  }

  /** The factory the loop takes; it remembers the loop as the listener. */
  readonly create = (listener: SchedulerListener) => {
    this.#listener = listener;
    return this;
  };

  async schedule(key: string, timerId: string, at: string): Promise<void> {
    // As a real scheduler: once closed, it takes no timer.
    if (this.closed) throw new Error("The scheduler is closed.");
    this.#timers.set(`${key}/${timerId}`, { key, timerId, at });
  }

  async cancel(key: string, timerId: string): Promise<void> {
    this.#timers.delete(`${key}/${timerId}`);
  }

  async pending(key: string): Promise<ScheduledTimer[]> {
    return [...this.#timers.values()].filter((timer) => timer.key === key);
  }

  /** Drops every timer; nothing is delivered after. */
  async close(): Promise<void> {
    this.closed = true;
    this.#timers.clear();
  }

  /** Lets `ms` pass, delivering every timer that comes due on the way at its own time. */
  async pass(ms: number): Promise<void> {
    const end = this.#clock.now().getTime() + ms;
    for (let next = this.#earliest(); next !== undefined; next = this.#earliest()) {
      const at = Date.parse(next.at);
      if (at > end) break;
      this.#clock.advance(Math.max(0, at - this.#clock.now().getTime()));
      this.#timers.delete(`${next.key}/${next.timerId}`);
      await this.#listener?.onTimer(next);
    }
    this.#clock.advance(end - this.#clock.now().getTime());
  }

  #earliest(): ScheduledTimer | undefined {
    return [...this.#timers.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  }
}

/** The provider behind the loop: its messaging, and the `refresh` a poll calls. */
export interface PolledProvider {
  readonly fake: AgentMessaging;
  refresh(): Promise<void>;
}

/** A server with the loop over `provider` behind its messaging routes, and a desktop per sign-in. */
export async function polledServer<Provider extends PolledProvider>(
  provider: Provider,
  desktops: number,
) {
  const clock = new TestClock();
  const scheduler = new FakeScheduler(clock);
  const errors: unknown[] = [];
  const loop = new MessagingPollLoop({
    source: provider.fake,
    // Read at every poll, so a test can make one poll slow or fail.
    refresh: () => provider.refresh(),
    createScheduler: scheduler.create,
    clock,
    report: (error) => errors.push(error),
  });
  const server = testServer({
    passwordHash: "hash:pw",
    clock,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    messaging: polledMessagingPorts(loop),
    errorLog: { record: (cause) => errors.push(cause) },
    config: { allowedHosts: ["localhost"], maxBodyBytes: 64 * 1024 },
  });
  const sessions = [];
  for (let count = 0; count < desktops; count += 1) {
    const headers = await signedIn(server);
    sessions.push({ headers, messaging: new RouteAgentMessaging(server, headers) });
  }
  await loop.start();
  return { server, clock, scheduler, loop, sessions, errors };
}
