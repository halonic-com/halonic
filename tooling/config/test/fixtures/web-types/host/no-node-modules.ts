// Node's modules don't resolve in the host preset (ADR 5.1: `node:*` is forbidden in the host).

// @ts-expect-error there are no Node types in the host
import { readFile } from "node:fs/promises";

export const read = readFile;
