import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let cached: NeonQueryFunction<false, false> | undefined;

/**
 * The Neon sql tagged template, created on first use.
 * Queries go over HTTPS so there is no connection to keep alive, which is what
 * serverless needs.
 */
export function getDb(): NeonQueryFunction<false, false> {
  if (cached !== undefined) return cached;

  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL is not set");
  }

  cached = neon(url);
  return cached;
}

/** Only for tests: swap the client for one backed by an in-process database. */
export function setDb(sql: NeonQueryFunction<false, false> | undefined): void {
  cached = sql;
}
