// `knowledge_search` and `knowledge_read`: the one way an agent's knowledge
// sources reach its model. Every title, snippet and document text goes
// through `knowledgeHitForModel` or `knowledgeDocForModel` first, so text a
// source didn't promise is the workspace's own reaches the model only
// inside the untrusted fence (requirement `ports.untrusted-knowledge`).

import { knowledgeDocForModel, knowledgeHitForModel } from "@halonicjs/app";
import type { KnowledgeHit, KnowledgeProvider } from "@halonicjs/ports";
import type { HalonicTool } from "../../agent/turn-tools.ts";
import { integerArg, requiredStringArg, type ToolArgs } from "../tool-args.ts";

/** The names of the knowledge tools, in the order they are offered. */
export const knowledgeToolNames = ["knowledge_search", "knowledge_read"] as const;

/** What `knowledge_search` answers when the source finds nothing. */
export const noHitsText = "No matches.";
/** What `knowledge_read` answers for a ref the source doesn't have. */
export const unknownRefText = "No document with that ref.";

/**
 * The knowledge tools of an agent (requirement `engine.knowledge-tools`):
 * `knowledge_search` and `knowledge_read` over the given sources, or none
 * when there are no sources. Both only read, so a run makes their calls
 * without a person's OK.
 *
 * @example
 * const tools = knowledgeTools([handbook]);
 * tools.map((tool) => tool.definition.name); // ["knowledge_search", "knowledge_read"]
 */
export function knowledgeTools(sources: readonly KnowledgeProvider[]): HalonicTool[] {
  if (sources.length === 0) {
    return [];
  }
  const ids = sources.map((source) => source.id);
  return [searchTool(sources, ids), readTool(sources, ids)];
}

function searchTool(sources: readonly KnowledgeProvider[], ids: readonly string[]): HalonicTool {
  return {
    definition: {
      name: "knowledge_search",
      description:
        "Searches one knowledge source and lists the best matches, each with its ref, title and a snippet. Read a whole document with knowledge_read and its ref.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string", enum: ids, description: "The knowledge source to search." },
          query: { type: "string", description: "What to look for." },
          limit: { type: "integer", minimum: 1, maximum: 20, description: "Default 5." },
        },
        required: ["source", "query"],
      },
    },
    risk: "read",
    run: async (args) => {
      const source = sourceArg(sources, args);
      const query = requiredStringArg(args, "query");
      const limit = integerArg(args, "limit", { min: 1, max: 20, fallback: 5 });
      const hits = await source.search(query, { limit });
      if (hits.length === 0) {
        return noHitsText;
      }
      return hits
        .slice(0, limit)
        .map((hit) => hitText(knowledgeHitForModel(source, hit)))
        .join("\n\n");
    },
  };
}

function readTool(sources: readonly KnowledgeProvider[], ids: readonly string[]): HalonicTool {
  return {
    definition: {
      name: "knowledge_read",
      description: "Reads a whole document from a knowledge source by the ref a search gave.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string", enum: ids, description: "The knowledge source to read." },
          ref: { type: "string", description: "The document's ref, as knowledge_search gave it." },
        },
        required: ["source", "ref"],
      },
    },
    risk: "read",
    run: async (args) => {
      const source = sourceArg(sources, args);
      const doc = await source.get(requiredStringArg(args, "ref"));
      if (doc === null) {
        return unknownRefText;
      }
      const forModel = knowledgeDocForModel(source, doc);
      return `ref: ${JSON.stringify(forModel.ref)}\ntitle: ${forModel.title}\n\n${forModel.content}`;
    },
  };
}

/**
 * One hit as text. The ref isn't fenced, because the model sends it back,
 * but it is quoted, so a ref with a line break can't start a line of its own.
 */
function hitText(hit: KnowledgeHit): string {
  return `ref: ${JSON.stringify(hit.ref)}\ntitle: ${hit.title}\n${hit.snippet}`;
}

/**
 * The source the model named.
 *
 * @throws Error listing the sources when it names none of them
 */
function sourceArg(sources: readonly KnowledgeProvider[], args: ToolArgs): KnowledgeProvider {
  const id = requiredStringArg(args, "source");
  const source = sources.find((each) => each.id === id);
  if (source === undefined) {
    const ids = sources.map((each) => each.id).join(", ");
    throw new Error(`"source" must be one of ${ids} (got ${JSON.stringify(id)})`);
  }
  return source;
}
