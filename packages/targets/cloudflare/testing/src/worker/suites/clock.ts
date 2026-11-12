/**
 * The `Clock` contract inside workerd, against the clock the Worker runtime
 * will use: `systemClock`, which reads workerd's `Date`. workerd only moves
 * `Date` forward between I/O, which the contract allows (never backwards).
 */

import { systemClock } from "@halonicjs/std";
import { clockContract } from "@halonicjs/testing-contracts";

clockContract("workerd system clock", async () => systemClock);
