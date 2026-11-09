import * as signIn from "../src/index.ts";

/** The parameters whose value is random on every sign-in, so the example prints only their length. */
const randomParameters = new Set(["state", "code_challenge"]);

/** Starts a sign-in for a made-up client and prints the auth URL's parameters. No network, no real IDs. */
export async function runExample(): Promise<string[]> {
  // Once per server. It holds the state and the PKCE verifier of each sign-in in memory.
  const pendingSignIns = signIn.createPendingSignIns({ now: () => new Date() });

  const authUrl = await signIn.startGoogleSignIn(
    {
      accountRef: "acme_clerk",
      clientId: "123456789-acme.apps.example.test",
      clientRef: "acme_client",
      redirect: { port: 8787, path: "/google/callback" },
      account: "clerk@acme.example", // the connector's address, used as the login hint
      services: [
        {
          id: "gmail",
          label: "Gmail",
          googleApis: [{ api: "gmail.googleapis.com", name: "Gmail API" }],
          googleScopes: [
            { scope: "https://www.googleapis.com/auth/gmail.readonly", reason: "Reads your mail" },
          ],
        },
      ],
    },
    pendingSignIns,
  );

  // Nothing was sent: the URL is what the browser opens. Print its parameters, hiding the random ones.
  const url = new URL(authUrl);
  const lines = [`${url.origin}${url.pathname}`];
  for (const [name, value] of url.searchParams) {
    lines.push(
      `  ${name}: ${randomParameters.has(name) ? `<${value.length} random characters>` : value}`,
    );
  }

  // The callback must carry the state from the URL. Anything else, or none, is refused.
  const state = url.searchParams.get("state") ?? "";
  lines.push(
    `callback with the URL's state: ${signIn.stateMatches(state, state) ? "accepted" : "refused"}`,
  );
  lines.push(
    `callback with another state: ${signIn.stateMatches(state, "forged-state") ? "accepted" : "refused"}`,
  );
  lines.push(
    `callback with no state: ${signIn.stateMatches(state, null) ? "accepted" : "refused"}`,
  );
  return lines;
}
