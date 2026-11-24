import type { Integration, IntegrationHost } from "@halonicjs/ports";

// A small, well-behaved integration the suite's own tests run. The attack
// fixtures are copies of it with one thing wrong.

const api = "https://api.example.com/v1";

async function forecast(host: IntegrationHost, args: Record<string, unknown>, signal?: AbortSignal) {
  const city = encodeURIComponent(String(args["city"]));
  const response = await host.http.fetch(`${api}/forecast?city=${city}`, {
    auth: { secret: "weather-key", as: "header", header: "x-api-key" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`weather: the forecast service answered ${response.status}`);
  const body = (await response.json()) as { summary: string };
  return `Forecast: ${body.summary}`;
}

async function saveFavourite(host: IntegrationHost, args: Record<string, unknown>, signal?: AbortSignal) {
  const response = await host.http.fetch(`${api}/favourites`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ city: String(args["city"]) }),
    auth: { secret: "weather-key", as: "header", header: "x-api-key" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`weather: saving the favourite failed with ${response.status}`);
  return "Saved.";
}

export const weather: Integration = {
  name: "weather",
  version: "1.0.0",
  tools: [
    {
      name: "forecast",
      description: "Today's forecast for a city.",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "The city's name." } },
        required: ["city"],
      },
      risk: "read",
      untrusted: true,
    },
    {
      name: "save-favourite",
      description: "Saves a city as a favourite.",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "The city's name." } },
        required: ["city"],
      },
      risk: "write",
    },
  ],
  connect: (host) => ({
    callTool: (name, args, signal) => {
      if (name === "forecast") return forecast(host, args, signal);
      if (name === "save-favourite") return saveFavourite(host, args, signal);
      return Promise.reject(new Error(`weather: no tool named ${name}`));
    },
    close: async () => {},
  }),
};
