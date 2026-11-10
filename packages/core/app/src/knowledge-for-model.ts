// Turns what a knowledge source returned into what the model sees, as
// `ports.untrusted-knowledge` asks: text a remote source wrote goes inside
// the untrusted fence on its way to the model, and nowhere else.

import type { KnowledgeDoc, KnowledgeHit, KnowledgeProvider } from "@halonicjs/ports";
import { fenceUntrusted } from "./untrusted-fence.ts";

/** What the model needs to know about a provider to read its texts. */
type KnowledgeTrust = Pick<KnowledgeProvider, "untrusted">;

/**
 * Whether the provider's texts go inside the fence. Only `untrusted: false`
 * lets them through as they are, so a provider that leaves it out is fenced.
 */
function isFenced(provider: KnowledgeTrust): boolean {
  return provider.untrusted !== false;
}

/**
 * A search hit as the model gets it. Unless the provider says
 * `untrusted: false`, the title and the snippet go inside the untrusted
 * fence. `ref` and `score` stay as they are: they aren't text the model
 * follows, and it sends the `ref` back to read the document.
 *
 * @example
 * const hits = await provider.search("release notes");
 * const forModel = hits.map((hit) => knowledgeHitForModel(provider, hit));
 */
export function knowledgeHitForModel(provider: KnowledgeTrust, hit: KnowledgeHit): KnowledgeHit {
  if (!isFenced(provider)) {
    return hit;
  }
  return {
    ref: hit.ref,
    title: fenceUntrusted(hit.title),
    snippet: fenceUntrusted(hit.snippet),
    score: hit.score,
  };
}

/**
 * A whole document as the model gets it. Unless the provider says
 * `untrusted: false`, the title and the content go inside the untrusted
 * fence; `ref` stays as it is.
 *
 * @example
 * const doc = await provider.get(ref);
 * const forModel = doc === null ? null : knowledgeDocForModel(provider, doc);
 */
export function knowledgeDocForModel(provider: KnowledgeTrust, doc: KnowledgeDoc): KnowledgeDoc {
  if (!isFenced(provider)) {
    return doc;
  }
  return {
    ref: doc.ref,
    title: fenceUntrusted(doc.title),
    content: fenceUntrusted(doc.content),
  };
}
