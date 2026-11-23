import { type ProxyFromEnv, proxyFromEnv } from "@halonicjs/adapter-http-node";

/**
 * The company proxy this process was started with, read once from
 * `HTTPS_PROXY` and `NO_PROXY` and handed to every client that reaches a
 * public `https` host. It is read here, in the app and outside the sandbox:
 * the sandbox launcher never gets a proxy variable. A proxy that is set but
 * unusable stays in the setting, so each request that needs it fails with
 * the reason and never goes direct.
 */
export const proxySetting: ProxyFromEnv = proxyFromEnv(process.env);
