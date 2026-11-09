import type { HttpClient, Secrets, TokenStore } from "@halonicjs/ports";
import { createIntegrationHost, type IntegrationPolicy } from "../src/index.ts";
import {
  type ArgumentSchema,
  type Integration,
  type IntegrationHttpClient,
  runTool,
  type ToolImplementation,
} from "../src/integration/index.ts";

// A made-up integration: one tool that reads a forecast from a made-up service.
interface ForecastArguments {
  city: string;
}

const forecastArguments: ArgumentSchema<ForecastArguments> = {
  // A Zod schema fits here as it is; the kit only needs `safeParse`.
  safeParse: (input) =>
    typeof input === "object" && input !== null && "city" in input && typeof input.city === "string"
      ? { success: true, data: { city: input.city } }
      : { success: false, error: { issues: [{ path: ["city"] }] } },
};

const forecastTool: ToolImplementation<IntegrationHttpClient, typeof forecastArguments> = {
  declaration: {
    name: "acme_forecast",
    description: "Reads tomorrow's forecast for a city.",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    risk: "read",
  },
  arguments: forecastArguments,
  async run(http, args, signal) {
    // The integration names the secret; the kit places it and the integration never holds it.
    const response = await http.fetch(
      `https://api.acme.example/v1/forecast?city=${encodeURIComponent(args.city)}`,
      { auth: { secret: "acme-key", as: "bearer" }, ...(signal ? { signal } : {}) },
    );
    const body = (await response.json()) as { summary: string };
    return { city: args.city, summary: body.summary };
  },
};

export const acmeForecast: Integration = {
  name: "acme-forecast",
  version: "1.0.0",
  tools: [forecastTool.declaration],
  connect: (host) => ({
    callTool: (name, args, signal) =>
      runTool([forecastTool], host.http, { name, args, signal }, (code, message) => {
        return new Error(`${code}: ${message}`);
      }),
    close: async () => {},
  }),
};

/** What the permission sheet allows: one host, and one secret that may go only there. */
const policy: IntegrationPolicy = {
  name: "acme-forecast",
  hosts: ["api.acme.example"],
  secrets: { "acme-key": { hosts: ["api.acme.example"], placement: { as: "bearer" } } },
  tokens: [],
};

/** Runs the tool through a host built over a fake transport; nothing goes to the network. */
export async function runExample(): Promise<{
  result: string;
  sentTo: string;
  authorizationPlaced: boolean;
  keyInResult: boolean;
  logged: number;
}> {
  const sent: { url: string; authorization: string | null }[] = [];
  const transport: HttpClient = {
    fetch: async (url, init) => {
      sent.push({ url, authorization: new Headers(init?.headers).get("authorization") });
      return Response.json({ summary: "Light rain, 11 degrees" });
    },
  };
  const key = "made-up-acme-key"; // never use a real key in an example
  const secrets: Secrets = { get: async (name) => (name === "acme-key" ? key : null) };
  const values = new Map<string, string>();
  const tokens: TokenStore = {
    get: async (name) => values.get(name) ?? null,
    set: async (name, value) => void values.set(name, value),
    remove: async (name) => void values.delete(name),
  };

  const { host, log } = createIntegrationHost({ policy, transport, secrets, tokens });
  const connection = acmeForecast.connect(host);
  const result = await connection.callTool("acme_forecast", { city: "Ghent" });
  await connection.close();

  return {
    result, // '{"city":"Ghent","summary":"Light rain, 11 degrees"}'
    sentTo: sent[0]?.url ?? "", // "https://api.acme.example/v1/forecast?city=Ghent"
    authorizationPlaced: sent[0]?.authorization === `Bearer ${key}`, // true: the kit put it in
    keyInResult: result.includes(key), // false
    logged: log.entries().length, // 1: Halonic keeps the log, the integration never sees it
  };
}
