/**
 * The chain is the record; the database holds what people signed on top of it. When the database
 * is unreachable the Record Book, the markets and the stats still have to render from chain state,
 * with the signed layer shown as empty and the response flagged, rather than the whole read
 * failing. Reads that need the database to mean anything (receipts, queues) keep throwing.
 */
let lastLogged = 0;

export async function dbSafe<T>(label: string, fallback: T, read: () => Promise<T>): Promise<{ value: T; dbDown: boolean }> {
  try {
    return { value: await read(), dbDown: false };
  } catch (error) {
    const now = Date.now();
    if (now - lastLogged > 60_000) {
      lastLogged = now;
      console.error(`[redeem] database read failed (${label}); serving chain state without the signed layer`, error instanceof Error ? error.message : error);
    }
    return { value: fallback, dbDown: true };
  }
}
