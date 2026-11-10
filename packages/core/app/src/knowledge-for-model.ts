// Turns what a knowledge source returned into what the model sees, as
// `ports.untrusted-knowledge` asks: text a remote source wrote goes inside
// the untrusted fence on its way to the model, and nowhere else. The ref
// can't be fenced, because the model sends it back, so its length is capped.

import type { KnowledgeDoc, KnowledgeHit, KnowledgeProvider } from "@halonicjs/ports";
import { fenceUntrusted } from "./untrusted-fence.ts";

/** What the model needs to know about a provider to read its texts. */
type KnowledgeTrust = Pick<KnowledgeProvider, "untrusted">;

/**
 * The most characters a fenced provider's ref may have. The ref reaches the
 * model unfenced, so a longer one could carry an instruction; paths and
 * links fit well within it.
 */
export const maxKnowledgeRefLength = 512;

/**
 * Whether the provider's texts go inside the fence. Only `untrusted: false`
 * lets them through as they are, so a provider that leaves it out is fenced.
 */
function isFenced(provider: KnowledgeTrust): boolean {
  return provider.untrusted !== false;
}

/** Whether a ref is too long to reach the model unfenced. */
function isRefTooLong(ref: string): boolean {
  return ref.length > maxKnowledgeRefLength;
}

/**
 * A search hit as the model gets it, or `null` when the model shouldn't get
 * it. Unless the provider says `untrusted: false`, the title and the snippet
 * go inside the untrusted fence, and a hit whose ref is longer than
 * {@link maxKnowledgeRefLength} is dropped. `ref` and `score` stay as they
 * are: they aren't text the model follows, and it sends the `ref` back to
 * read the document.
 *
 * @example
 * const hits = await provider.search("release notes");
 * const forModel = hits.flatMap((hit) => knowledgeHitForModel(provider, hit) ?? []);
 */
export function knowledgeHitForModel(
  provider: KnowledgeTrust,
  hit: KnowledgeHit,
): KnowledgeHit | null {
  if (!isFenced(provider)) {
    return hit;
  }
  if (isRefTooLong(hit.ref)) {
    return null;
  }
  return {
    ref: hit.ref,
    title: fenceUntrusted(hit.title),
    snippet: fenceUntrusted(hit.snippet),
    score: hit.score,
  };
}

/**
 * A whole document as the model gets it, or `null` when the model shouldn't
 * get it. Unless the provider says `untrusted: false`, the title and the
 * content go inside the untrusted fence, and a document whose ref is longer
 * than {@link maxKnowledgeRefLength} is dropped; `ref` stays as it is.
 *
 * @example
 * const doc = await provider.get(ref);
 * const forModel = doc === null ? null : knowledgeDocForModel(provider, doc);
 */
export function knowledgeDocForModel(
  provider: KnowledgeTrust,
  doc: KnowledgeDoc,
): KnowledgeDoc | null {
  if (!isFenced(provider)) {
    return doc;
  }
  if (isRefTooLong(doc.ref)) {
    return null;
  }
  return {
    ref: doc.ref,
    title: fenceUntrusted(doc.title),
    content: fenceUntrusted(doc.content),
  };
}
