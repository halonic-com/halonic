import { formatPath, type Infer, parse, s, toJsonSchema } from "../src/index.ts";

const Deployment = s
  .object({
    name: s.string().min(1),
    host: s.enum(["local", "cloudflare"]).default("local"),
  })
  .strict();
type Deployment = Infer<typeof Deployment>; // { name: string; host: "local" | "cloudflare" }

/** Parses good and bad input, lists the problems with their paths and exports a JSON Schema. */
export function runExample(): {
  value: Deployment | undefined;
  problems: string[];
  required: unknown;
} {
  // Defaults are filled in.
  const good = parse(Deployment, { name: "prod" });
  const value = good.ok ? good.value : undefined; // { name: "prod", host: "local" }

  // A bad input never throws: every problem comes back with its path.
  const problems: string[] = [];
  const parsed = parse(Deployment, { name: "", extra: true });
  if (!parsed.ok) {
    for (const issue of parsed.error) {
      problems.push(`${issue.code} ${formatPath(issue.path)}`.trim());
    }
  }

  // `host` is not required: it has a default.
  const required = toJsonSchema(Deployment)["required"]; // ["name"]
  return { value, problems, required };
}
