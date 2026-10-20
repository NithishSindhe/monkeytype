import { afterAll, beforeAll, afterEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { setupCommonMocks } from "../setup-common-mocks";
import { setDb } from "../../src/init/sql";
import { createPgliteClient } from "./pglite-client";

process.env["MODE"] = "dev";
process.env.TZ = "UTC";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../db/migrations");

let pglite: PGlite | undefined;

/** Every table the migrations create, so they can be emptied between tests. */
let tables: string[] = [];

setupCommonMocks();

beforeAll(async () => {
  // an in-process Postgres: no docker, no network, and no shared state between
  // test files because vitest gives each file its own worker
  pglite = new PGlite({ extensions: { pgcrypto } });

  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((it) => it.endsWith(".sql"))
    .sort()) {
    await pglite.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }

  const result = await pglite.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public'`,
  );
  tables = result.rows.map((it) => it.tablename);

  // the DALs reach for the neon client through getDb(), this swaps in one that
  // talks to PGlite instead
  setDb(createPgliteClient(pglite));

  //we compare the time in the database to calculate premium status, so we have to use real time here
  vi.useRealTimers();
});

afterEach(async () => {
  if (pglite === undefined || tables.length === 0) return;

  // restart identity so uuids/sequences do not leak between tests, cascade so
  // the foreign keys onto users do not get in the way
  await pglite.exec(
    `truncate table ${tables.map((it) => `"${it}"`).join(", ")} restart identity cascade`,
  );
});

afterAll(async () => {
  setDb(undefined);
  await pglite?.close();
  pglite = undefined;
  tables = [];

  vi.resetAllMocks();
});
