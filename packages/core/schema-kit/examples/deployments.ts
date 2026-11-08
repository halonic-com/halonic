import { type Infer, type Issue, s, toJsonSchema } from "../src/index.ts";

// deployments.yaml: at least one deployment, each with a host and a stage.
export const Deployments = s
  .object({
    version: s.literal(1).default(1),
    default: s.string().optional(),
    deployments: s
      .record(
        s.string().regex(/^[a-z0-9][a-z0-9-_]*$/, "use lowercase letters, digits, '-' or '_'"),
        s
          .object({
            name: s.string().min(1),
            host: s.enum(["local", "cloudflare"]).default("local"),
            stage: s.enum(["development", "production"]).default("development"),
          })
          .strict(),
      )
      .refine((deployments) => Object.keys(deployments).length > 0, "Name at least one deployment"),
  })
  .strict();

export type Deployments = Infer<typeof Deployments>;

/** Reads parsed YAML: the typed value, or each problem with the path the YAML layer turns into a line. */
export function readDeployments(input: unknown): Deployments | readonly Issue[] {
  const result = Deployments.safeParse(input);
  return result.ok ? result.value : result.error;
}

/** The JSON Schema editors use for deployments.yaml. */
export const deploymentsJsonSchema = toJsonSchema(Deployments);
