import { isMap, isNode, isScalar, type Node } from "yaml";
import { childrenOf } from "./unsupported.ts";

/** The parser's words for a key that is in its map twice, kept as they were. */
export const duplicateKeyMessage = "Map keys must be unique";

/**
 * The first key, in document order, that its map already has: a plain key
 * with the same value as one before it, as the yaml library's own check
 * reads it. The library's check compares each key with every key before it,
 * which takes quadratic time in a map's size, so `readYaml` turns it off and
 * runs this one, which keeps a set of each map's keys.
 *
 * The walk keeps its own stack instead of recursing, so a hostile file
 * cannot overflow the call stack.
 */
export function findDuplicateKey(root: unknown): Node | undefined {
  const stack: unknown[] = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (!isNode(node)) {
      continue;
    }
    if (isMap(node)) {
      const duplicate = duplicateIn(node.items.map((pair) => pair.key));
      if (duplicate !== undefined) {
        return duplicate;
      }
    }
    // Push in reverse, so the first child comes off the stack first.
    for (const child of childrenOf(node).reverse()) {
      stack.push(child);
    }
  }
  return undefined;
}

/** The first scalar key whose value an earlier one has. A list or map as a key is never equal to another. */
function duplicateIn(keys: readonly unknown[]): Node | undefined {
  const seen = new Set<unknown>();
  for (const key of keys) {
    if (!isScalar(key)) {
      continue;
    }
    if (seen.has(key.value)) {
      return key;
    }
    seen.add(key.value);
  }
  return undefined;
}
