import { expect } from "vitest";
import { eventually, keepOnFailure } from "../src/index.ts";

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

// Call this inside a test. On failure, the delivered list is kept as JSON.
export async function runExample() {
  const world = newWorld();
  keepOnFailure("delivered", () => world.delivered);

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
