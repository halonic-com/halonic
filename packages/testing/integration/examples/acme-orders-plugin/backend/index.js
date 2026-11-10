// The Acme orders plugin's backend: the Integration that Halonic loads from
// this file. It reaches the shop only through `host.http` and never sees the
// key: Halonic puts it into each request to api.acme.example.

const api = "https://api.acme.example/v1";

/** Reads one JSON answer from the shop, with the key placed by Halonic. */
async function getJson(host, path, signal) {
  const response = await host.http.fetch(`${api}${path}`, {
    auth: { secret: "acme-key", as: "bearer" },
    ...(signal ? { signal } : {}),
  });
  // Only the status: the shop's error text could hold anything.
  if (!response.ok) throw new Error(`acme-orders: the shop answered ${response.status}`);
  return response.json();
}

async function findOrder(host, args, signal) {
  const number = encodeURIComponent(String(args.order));
  const order = await getJson(host, `/orders/${number}`, signal);
  return `Order ${order.id}: ${order.status}, ${order.items} item(s), ${order.total}`;
}

async function openOrders(host, signal) {
  const { orders } = await getJson(host, "/orders?status=open", signal);
  const rows = orders.map((order) => `| ${order.id} | ${order.status} | ${order.total} |`);
  return ["| Order | Status | Total |", "| --- | --- | --- |", ...rows].join("\n");
}

export const acmeOrders = {
  name: "acme-orders",
  version: "1.0.0",
  tools: [
    {
      name: "find-order",
      description: "Finds one order by its number.",
      parameters: {
        type: "object",
        properties: {
          order: { type: "string", description: "The order number, such as A-1001." },
        },
        required: ["order"],
      },
      risk: "read",
      untrusted: true,
    },
    {
      name: "open-orders",
      description: "Lists the orders that haven't shipped yet.",
      parameters: { type: "object", properties: {} },
      risk: "read",
      untrusted: true,
    },
  ],
  connect: (host) => ({
    callTool: (name, args, signal) => {
      if (name === "find-order") return findOrder(host, args, signal);
      if (name === "open-orders") return openOrders(host, signal);
      return Promise.reject(new Error(`acme-orders: no tool named ${name}`));
    },
    close: async () => {},
  }),
};
