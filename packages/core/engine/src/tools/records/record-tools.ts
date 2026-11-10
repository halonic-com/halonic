// `find_<id>`, `add_<id>` and `update_<id>`: the tools of an agent with
// `collections`, one set per collection it lists.

import type { Collection, CollectionField } from "@halonicjs/format";
import type { Clock, RecordStore } from "@halonicjs/ports";
import type { HalonicTool } from "../../agent/turn-tools.ts";
import { integerArg, optionalStringArg, requiredStringArg, type ToolArgs } from "../tool-args.ts";
import { CollectionRecords, defaultFindLimit } from "./collection-records.ts";

/** What the records tools need: the agent's collections, where records live, and who writes. */
export interface RecordToolsOptions {
  /** The ids in the agent's `collections`. */
  readonly collectionIds: readonly string[];
  /** The collections the agent's hub can see by id; one that isn't here gets no tools. */
  readonly collections: Readonly<Record<string, Collection>>;
  readonly records: RecordStore;
  readonly clock: Clock;
  /** The agent that writes, which every change names. */
  readonly agent: string;
  /** The run the agent is in, which every change names; absent outside a run. */
  readonly runId?: string;
}

/**
 * The records tools of an agent with `collections` (requirement
 * `engine.record-tools`): for each collection it lists that the hub can
 * see, `find_<id>`, `add_<id>` and `update_<id>`, with the id's characters
 * other than letters, digits and `_` written as `_`. Each answers with JSON.
 *
 * @example
 * recordTools({ collectionIds: ["invoices"], collections, records, clock, agent: "clerk" })
 *   .map((tool) => tool.definition.name); // ["find_invoices", "add_invoices", "update_invoices"]
 */
export function recordTools(options: RecordToolsOptions): HalonicTool[] {
  const by = {
    agent: options.agent,
    ...(options.runId === undefined ? {} : { runId: options.runId }),
  };
  return options.collectionIds.flatMap((id) => {
    // An own key only: an id such as `constructor` must not find Object.prototype's.
    const collection = Object.hasOwn(options.collections, id) ? options.collections[id] : undefined;
    if (collection === undefined) {
      return [];
    }
    const records = new CollectionRecords(options.records, collection, options.clock, by);
    const name = id.replace(/[^a-zA-Z0-9_]/g, "_");
    return [
      findTool(name, collection, records),
      addTool(name, collection, records),
      updateTool(name, collection, records),
    ];
  });
}

function findTool(name: string, collection: Collection, records: CollectionRecords): HalonicTool {
  const views = Object.keys(collection.views);
  const viewList = views.length > 0 ? ` Views: ${views.join(", ")}.` : "";
  return {
    definition: {
      name: `find_${name}`,
      description: `Find records in "${collection.name}". Fields: ${fieldList(collection)}.${viewList} where: field -> value, a list of values, null for empty, or {gte, lte, gt, lt, not}; "today" is today's date.`,
      parameters: {
        type: "object",
        properties: {
          where: {
            type: "object",
            description: "Filter by field values.",
            // Any field name: the filter checks the names, and a run's call check reads every level.
            additionalProperties: true,
          },
          ...(views.length > 0 ? { view: { type: "string", enum: views } } : {}),
          limit: { type: "integer", minimum: 1, maximum: defaultFindLimit },
        },
      },
    },
    run: async (args) => {
      const view = optionalStringArg(args, "view");
      const where = objectArg(args, "where");
      const limit = integerArg(args, "limit", {
        min: 1,
        max: defaultFindLimit,
        fallback: defaultFindLimit,
      });
      const found = await records.find({
        limit,
        ...(view === undefined ? {} : { view }),
        ...(where === undefined ? {} : { where }),
      });
      return JSON.stringify(found);
    },
  };
}

function addTool(name: string, collection: Collection, records: CollectionRecords): HalonicTool {
  const required = Object.entries(collection.fields)
    .filter(([, field]) => field.required && field.compute === undefined)
    .map(([fieldName]) => fieldName);
  return {
    definition: {
      name: `add_${name}`,
      description: `Add a record to "${collection.name}". Computed fields are filled in. Answers with the stored record.`,
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Optional id; one is made when left out." },
          ...fieldSchema(collection),
        },
        required,
      },
    },
    run: async (args) => JSON.stringify(await records.add({ ...args })),
  };
}

function updateTool(name: string, collection: Collection, records: CollectionRecords): HalonicTool {
  return {
    definition: {
      name: `update_${name}`,
      description: `Change fields of a record in "${collection.name}". Only the given fields change.`,
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          values: { type: "object", properties: fieldSchema(collection) },
        },
        required: ["id", "values"],
      },
    },
    run: async (args) => {
      const id = requiredStringArg(args, "id");
      const values = objectArg(args, "values");
      if (values === undefined) {
        throw new Error('"values" is required');
      }
      return JSON.stringify(await records.update(id, values));
    },
  };
}

// A field as the find tool lists it, such as "status (choice: open/paid)".
function fieldList(collection: Collection): string {
  return Object.entries(collection.fields)
    .map(([fieldName, field]) => {
      const computed = field.compute === undefined ? "" : ", computed";
      const values = field.values === undefined ? "" : `: ${field.values.join("/")}`;
      return `${fieldName} (${field.type}${computed}${values})`;
    })
    .join(", ");
}

/** The JSON Schema of a collection's fields an agent may set, for the add and update tools. */
export function fieldSchema(collection: Collection): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [fieldName, field] of Object.entries(collection.fields)) {
    if (field.compute !== undefined) {
      continue;
    }
    const description = [field.description, formatHint(field)].filter(Boolean).join("; ");
    properties[fieldName] = { ...jsonType(field), ...(description ? { description } : {}) };
  }
  return properties;
}

function jsonType(field: CollectionField): Record<string, unknown> {
  switch (field.type) {
    case "number":
    case "money":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "choice":
      return { type: "string", enum: field.values };
    default:
      return { type: "string" };
  }
}

function formatHint(field: CollectionField): string {
  switch (field.type) {
    case "money":
      return "amount";
    case "date":
      return "YYYY-MM-DD";
    case "month":
      return "YYYY-MM";
    case "ref":
      return `id in ${field.collection}`;
    default:
      return "";
  }
}

/**
 * An object argument, or `undefined` when the model left it out.
 *
 * @throws Error naming the argument when it is there but isn't an object
 */
function objectArg(args: ToolArgs, name: string): Record<string, unknown> | undefined {
  const value = args[name];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`"${name}" must be an object (got ${JSON.stringify(value)})`);
  }
  return { ...value };
}
