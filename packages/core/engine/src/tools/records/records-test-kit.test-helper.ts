import type { Collection } from "@halonicjs/format";

/** An `acme` invoices collection with a field of every type, a computed share and two views. */
export const invoices: Collection = {
  version: 1,
  id: "invoices",
  name: "Invoices",
  implements: [],
  fields: {
    supplier: { type: "ref", collection: "suppliers", required: true },
    note: { type: "text", required: false },
    amount: { type: "money", required: true, min: 0 },
    sharePct: { type: "number", required: false, max: 100, default: 100 },
    share: { type: "money", required: false, compute: "amount * sharePct / 100" },
    due: { type: "date", required: false },
    period: { type: "month", required: false },
    status: { type: "choice", required: false, values: ["open", "paid"] },
    disputed: { type: "boolean", required: false },
  },
  views: {
    open: { where: { status: "open" }, total: "amount", sort: "due" },
    all: { where: {} },
  },
  seed: [],
};
