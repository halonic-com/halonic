/**
 * The Durable Object classes this package defines. Cloudflare keys an
 * object's data by its class name, so renaming or deleting one deletes the
 * data of every object of that class. Add a name here only together with a
 * migration entry in the Worker's configuration; never change or remove one.
 * `class-names.test.ts` fails when one disappears from the package's exports.
 */
export const durableObjectClassNames = ["CoordinationObject", "RunObject"] as const;
