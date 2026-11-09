# @halonicjs/testing-scenario

Helpers for scenario-style tests: `eventually()` checks until the state is right instead of sleeping.

- **Layer:** testing
- **Owner:** julian
- **Public API:** `eventually`

`eventually(check, { within, every, wait })` runs `check` at once and, while
it throws, waits `every` milliseconds and checks again. `within` is the sum of
the waits, not a wall-clock limit: a slow machine runs exactly the same
checks as a fast one, and Vitest's test timeout stays the wall-clock backstop.
Pass your fake world's step as `wait` so the wait moves fake time; without
it, `eventually` waits on a real timer.

Use `eventually` when the intent is "at some point within X". When the intent
is "not before T, and exactly at T", wait the exact time and check once
instead, or an off-by-one would pass.

## Example

This is [`examples/wait-on-a-fake-world.ts`](examples/wait-on-a-fake-world.ts), which `src/example.test.ts` runs. The file imports from `../src/index.ts` because a package can't import itself by name; in your own package, import from `@halonicjs/testing-scenario`.

```ts
import { expect } from "vitest";
import { eventually } from "@halonicjs/testing-scenario";

// A fake world: a queue that delivers one message every 1000 ms of fake time.
function newWorld() {
  const delivered: string[] = [];
  let now = 0;
  return {
    delivered,
    wait(ms: number) {
      for (let step = 0; step < ms; step += 1) {
        now += 1;
        if (now % 1000 === 0) delivered.push(`acme-${now / 1000}`);
      }
    },
  };
}

export async function runExample() {
  const world = newWorld();

  // "At some point within a minute, three messages arrive": eventually.
  const third = await eventually(
    () => {
      expect(world.delivered).toHaveLength(3);
      return world.delivered[2];
    },
    { intent: "three messages arrive", within: 60_000, every: 500, wait: world.wait },
  );
  return { third, delivered: [...world.delivered] }; // third: "acme-3"
}
```

Add the package as a `devDependency` (`"@halonicjs/testing-scenario": "workspace:*"`).
