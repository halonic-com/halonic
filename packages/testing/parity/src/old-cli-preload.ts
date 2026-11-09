/**
 * Loaded before the old CLI (`tsx --import`), in the scratch clone of the old
 * repo, never in this one: fixes its clock at PARITY_FIXED_TIME and makes its
 * random source count up. See `fixClockAndRandom`.
 */
import { fixClockAndRandom } from "./old-cli-clock.ts";

/** Gives back the real clock; only tests that load this file call it. */
export const restore = fixClockAndRandom(process.env["PARITY_FIXED_TIME"] ?? "");
