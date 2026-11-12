import type { ServerErrorBody } from "./api.ts";

/** The error codes this package sends, each with its status. A client switches on the code. */
export const serverErrors = {
  hostNotAllowed: {
    status: 421,
    code: "host_not_allowed",
    message: "This server doesn't answer to that host name.",
  },
  originNotAllowed: {
    status: 403,
    code: "origin_not_allowed",
    message: "Requests from other origins are refused.",
  },
  bodyTooLarge: { status: 413, code: "body_too_large", message: "The request body is too large." },
  notFound: { status: 404, code: "not_found", message: "There is nothing at this address." },
  internal: {
    status: 500,
    code: "internal_error",
    message: "The server couldn't answer this request.",
  },
} as const;

/** One entry of {@link serverErrors}. */
export type ServerError = (typeof serverErrors)[keyof typeof serverErrors];

/** Builds the JSON response of an error: a code and a short message, nothing else. */
export function errorResponse(error: ServerError): Response {
  const body: ServerErrorBody = { code: error.code, message: error.message };
  return Response.json(body, { status: error.status });
}
