import type { Connector } from "@halonicjs/format";
import { trustContent } from "../src/index.ts";

/** A made-up `acme` mail connector that starts a program. */
const mail: Connector = {
  version: 1,
  id: "mail",
  name: "Mail",
  transport: {
    stdio: {
      command: "node",
      args: ["./scripts/mail.js", "--inbox", "work"],
      cwd: "./tools/..",
      env: { MODE: "safe" },
      secretEnv: { MAIL_TOKEN: "mail-token" },
    },
  },
  tools: { approve: ["send_mail"] },
};

/** Builds the trust content of the `acme` workspace's one connector. */
export function runExample(): unknown {
  return trustContent({
    connectors: [mail],
    commandPaths: new Map([["node", "/usr/bin/node"]]),
  });
  // {
  //   connectors: [{
  //     version: 1, id: "mail", transport: "stdio",
  //     settings: {
  //       command: "node", path: "/usr/bin/node", args: ["./scripts/mail.js", "--inbox", "work"],
  //       cwd: ".", env: { MODE: "safe" }, secretEnv: { MAIL_TOKEN: "‹secret mail-token›" },
  //     },
  //     tools: { approve: ["send_mail"] },
  //   }],
  // }
}
