/** Serves the built Vercel function locally for smoke tests:  bun scripts/vercel-serve.ts [port] */
import { createServer } from "node:http";
import path from "node:path";

const port = Number(process.argv[2] ?? 3999);
const mod = await import(path.resolve(import.meta.dirname, "../.vercel/output/functions/api.func/index.mjs"));
createServer(mod.default).listen(port, () => console.log(`function on http://localhost:${port}`));
