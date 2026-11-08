import type { Coordination, CounterResult, Lease, WindowCount } from "@halonicjs/ports";

/**
 * The value part of `Coordination` in memory, for the kernel's own tests.
 * The kernel uses only `read` and `compareAndSet`; the rest refuses. A
 * deliberate fake: core may not use adapters, not even in tests. Running
 * the kernel against real adapters is the targets' job.
 */
export class TestCoordination implements Coordination {
  readonly values = new Map<string, string>();

  async read(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean> {
    if ((this.values.get(key) ?? null) !== expected) {
      return false;
    }
    if (next === null) {
      this.values.delete(key);
    } else {
      this.values.set(key, next);
    }
    return true;
  }

  tryAcquire(): Promise<Lease | null> {
    return unused();
  }

  renew(): Promise<Lease | null> {
    return unused();
  }

  release(): Promise<void> {
    return unused();
  }

  increment(): Promise<CounterResult> {
    return unused();
  }

  countInWindow(): Promise<WindowCount> {
    return unused();
  }
}

function unused(): Promise<never> {
  return Promise.reject(new Error("not used by the kernel"));
}
