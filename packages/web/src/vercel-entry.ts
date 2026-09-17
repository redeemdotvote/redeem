/**
 * Vercel function entry. The whole Hono app (oRPC at /api/rpc/*, REST at /api/v1/*) is served by
 * this one Node.js function. It is bundled into a single file by scripts/vercel-build.ts, and the
 * Build Output config routes every /api/* request here with the original path intact, so the
 * app's full-path routes match unchanged. Node request in, Web Response out.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import app from "./api";

const BODYLESS = new Set(["GET", "HEAD"]);

async function toRequest(req: IncomingMessage): Promise<Request> {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? "https";
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "localhost";
  const url = `${proto}://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }
  const method = req.method ?? "GET";
  let body: ArrayBuffer | undefined;
  if (!BODYLESS.has(method)) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    const buffer = Buffer.concat(chunks);
    body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  }
  return new Request(url, { method, headers, body });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const response = await app.fetch(await toRequest(req));
    const headers: Record<string, string | string[]> = {};
    response.headers.forEach((value, key) => {
      if (key === "set-cookie") headers[key] = response.headers.getSetCookie();
      else headers[key] = value;
    });
    res.writeHead(response.status, headers);
    if (response.body && req.method !== "HEAD") {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (error) {
    console.error("[redeem] request failed", error);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "internal_error" }));
  }
}
