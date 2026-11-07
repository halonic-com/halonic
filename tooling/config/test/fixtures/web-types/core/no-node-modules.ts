// Node's modules don't resolve in the core preset (and `pnpm check layers` forbids them too).

// @ts-expect-error there are no Node types in the core
import { readFile } from "node:fs/promises";

export const read = readFile;
