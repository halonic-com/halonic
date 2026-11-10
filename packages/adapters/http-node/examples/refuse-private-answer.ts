import { AddressRefusedError, createNodeHttpClient } from "../src/index.ts";

/** A public host whose name resolves to a private address is refused before anything is sent. */
export async function runExample(): Promise<string> {
  const http = createNodeHttpClient({
    // Only api.example.com is allowed, as a public host.
    hostClass: (url) => (url.hostname === "api.example.com" ? "public" : undefined),
    // A made-up DNS answer, as a rebinding attacker would give it.
    resolve: async () => ["10.0.0.5"],
  });
  try {
    await http.fetch("https://api.example.com/v1/items", { redirect: "manual" });
    return "sent";
  } catch (error) {
    if (error instanceof AddressRefusedError) {
      return error.code; // "address-not-allowed"
    }
    throw error;
  }
}
