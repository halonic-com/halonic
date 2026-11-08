import { isAlias, isCollection, isMap, isNode, isPair, isSeq, type Node } from "yaml";
import type { YamlProblemKind } from "./problem.ts";

/** What `findUnsupported` reports: the node at fault and why. */
export interface UnsupportedNode {
  readonly node: Node;
  readonly kind: Extract<YamlProblemKind, "unsupported" | "too-deep">;
  readonly message: string;
}

/** Explains each YAML feature that workspace files may not use. */
export const unsupportedMessages = {
  anchor: "Anchors (&name) are not supported in workspace files. Write the value out in full.",
  alias: "Aliases (*name) are not supported in workspace files. Write the value out in full.",
  tag: 'Tags such as "!!str" are not supported in workspace files. Remove the tag, and quote the value if it must stay text.',
  collectionKey: "Lists and maps are not supported as keys in workspace files. Use a plain key.",
  multipleDocuments:
    'Workspace files hold one YAML document. Remove the second "---" or split the file.',
} as const;

/** Explains that the lists and maps nest deeper than `maxDepth`. */
export function tooDeepMessage(maxDepth: number): string {
  return `Lists and maps nest more than ${maxDepth} levels deep. Workspace files never need that many; look for a runaway structure.`;
}

interface Pending {
  readonly node: unknown;
  /** How many lists and maps contain this node. */
  readonly depth: number;
}

/**
 * Walks the parsed nodes in document order and returns the first one that
 * uses an unsupported feature or nests deeper than `maxDepth`.
 *
 * The walk keeps its own stack instead of recursing, so a hostile file
 * cannot overflow the call stack.
 */
export function findUnsupported(root: unknown, maxDepth: number): UnsupportedNode | undefined {
  const stack: Pending[] = [{ node: root, depth: 0 }];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const { node, depth } = next;
    if (!isNode(node)) {
      continue;
    }
    const problem = problemWith(node, depth, maxDepth);
    if (problem !== undefined) {
      return problem;
    }
    // Push in reverse, so the first child comes off the stack first.
    for (const child of childrenOf(node).reverse()) {
      stack.push({ node: child, depth: depth + 1 });
    }
  }
  return undefined;
}

function problemWith(node: Node, depth: number, maxDepth: number): UnsupportedNode | undefined {
  if (isAlias(node)) {
    return { node, kind: "unsupported", message: unsupportedMessages.alias };
  }
  if (node.anchor !== undefined) {
    return { node, kind: "unsupported", message: unsupportedMessages.anchor };
  }
  if (node.tag !== undefined) {
    return { node, kind: "unsupported", message: unsupportedMessages.tag };
  }
  if (isCollection(node) && depth >= maxDepth) {
    return { node, kind: "too-deep", message: tooDeepMessage(maxDepth) };
  }
  if (isMap(node)) {
    const collectionKey = node.items.find((pair) => isCollection(pair.key));
    if (collectionKey !== undefined) {
      return {
        node: collectionKey.key as Node,
        kind: "unsupported",
        message: unsupportedMessages.collectionKey,
      };
    }
  }
  return undefined;
}

/** The keys and values inside a list or map, in document order. */
function childrenOf(node: Node): unknown[] {
  if (!isMap(node) && !isSeq(node)) {
    return [];
  }
  return node.items.flatMap((item: unknown) => (isPair(item) ? [item.key, item.value] : [item]));
}
