/**
 * Vercel entry for the Redeem API. The whole Hono app (oRPC at /api/rpc/*, REST at /api/v1/*)
 * is served by this one function; vercel.json rewrites every /api/* request here and leaves the
 * original path intact, so the app's full-path routes match unchanged. Web-standard handler:
 * Request in, Response out, no Node req/res plumbing.
 */
import app from "../src/api";

const handler = (request: Request) => app.fetch(request);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
