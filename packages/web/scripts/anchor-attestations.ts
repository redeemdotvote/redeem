/**
 * Second anchor for attested tallies: copies every frozen attestation and meeting report, with its
 * OpenTimestamps proof, from the live API into `attestations/` at the repo root, so committing
 * them puts the same hashes into public git history.
 *
 * Run from packages/web:  bun scripts/anchor-attestations.ts [origin]
 * Then: git add attestations && git commit -m "Anchor attestations" && git push
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const origin = (process.argv[2] ?? "https://www.redeem.vote").replace(/\/$/, "");
const out = path.resolve(import.meta.dirname, "../../../attestations");
await mkdir(out, { recursive: true });

const list = (await (await fetch(`${origin}/api/v1/attestations`)).json()) as { attestations: Array<{ itemId: string; ballotId: string; stamped: boolean; digest: string | null }> };
const save = async (url: string, file: string) => {
  const response = await fetch(url);
  if (!response.ok) return false;
  await writeFile(path.join(out, file), Buffer.from(await response.arrayBuffer()));
  return true;
};

let written = 0;
const ballots = new Set<string>();
for (const entry of list.attestations) {
  ballots.add(entry.ballotId);
  if (await save(`${origin}/api/v1/attestations/${entry.itemId}/document`, `attestation-${entry.itemId}.json`)) written += 1;
  await save(`${origin}/api/v1/attestations/${entry.itemId}/proof.ots`, `attestation-${entry.itemId}.json.ots`);
}
for (const ballotId of ballots) {
  if (await save(`${origin}/api/v1/reports/${ballotId}/document`, `report-${ballotId}.json`)) written += 1;
  await save(`${origin}/api/v1/reports/${ballotId}/proof.ots`, `report-${ballotId}.json.ots`);
}
console.log(`${written} frozen documents written to ${path.relative(process.cwd(), out)} from ${origin}`);
