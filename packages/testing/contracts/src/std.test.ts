import { fixedClock, fixedIds, randomIds, systemClock } from "@halonicjs/std";
import { clockContract } from "./clock.ts";
import { idGeneratorContract } from "./id-generator.ts";

// The std clocks and id generators are adapters for the Clock and IdGenerator ports too.
const cryptoBytes = (count: number) => crypto.getRandomValues(new Uint8Array(count));

clockContract("std systemClock", async () => systemClock);
clockContract("std fixedClock", async () => fixedClock());
clockContract("std fixedClock that stands still", async () => fixedClock(0, 0));

idGeneratorContract("std fixedIds", async () => fixedIds());
// fixedClock moves on per call, so the time part keeps every id apart and the run can't flake.
idGeneratorContract("std randomIds", async () => randomIds(cryptoBytes, fixedClock()));
