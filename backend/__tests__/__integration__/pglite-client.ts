import { PGlite, types } from "@electric-sql/pglite";
import type { NeonQueryFunction } from "@neondatabase/serverless";

/**
 * An in-process Postgres that answers to the same calls as the
 * `@neondatabase/serverless` client the backend uses, so the DALs can run
 * against it unchanged.
 *
 * The neon client is a function that is also an object:
 *   - called as a tagged template: sql`select * from users where uid = ${uid}`
 *   - called as a method:          sql.query("select ... where uid = $1", [uid])
 *
 * Both return a plain array of row objects.
 */
export type PgliteNeonClient = NeonQueryFunction<false, false> & {
  /** The underlying database, for the setup code. */
  pglite: PGlite;
};

/**
 * Neon returns `bigint` (int8) columns as strings, because they do not always
 * fit in a JS number. The DALs rely on that and call `Number()` themselves, so
 * the adapter has to do the same instead of handing back numbers.
 */
const BIGINT_OID = 20;
const BIGINT_ARRAY_OID = 1016;

const parsers = {
  [BIGINT_OID]: (value: string): string => value,
  [BIGINT_ARRAY_OID]: (value: string): unknown =>
    types.arrayParser(
      value,
      (element: string) => element,
      BIGINT_OID,
    ) as unknown,
};

type Row = Record<string, unknown>;

/** Turns a tagged template into a `$1, $2, ...` query. */
function toPlaceholders(strings: TemplateStringsArray): string {
  return strings.reduce(
    (query, part, index) => (index === 0 ? part : `${query}$${index}${part}`),
    "",
  );
}

export function createPgliteClient(pglite: PGlite): PgliteNeonClient {
  const run = async (text: string, params: unknown[]): Promise<Row[]> => {
    const result = await pglite.query<Row>(text, params, { parsers });
    return result.rows;
  };

  const client = async (
    strings: TemplateStringsArray,
    ...params: unknown[]
  ): Promise<Row[]> => run(toPlaceholders(strings), params);

  const withMethods = client as unknown as Record<string, unknown>;

  withMethods["query"] = async (
    text: string,
    params?: unknown[],
  ): Promise<Row[]> => run(text, params ?? []);

  // the backend does not use these, but they are part of the neon surface
  withMethods["unsafe"] = (value: string): string => value;
  withMethods["transaction"] = async (): Promise<never> => {
    throw new Error("transactions are not supported by the test client");
  };

  withMethods["pglite"] = pglite;

  return client as unknown as PgliteNeonClient;
}
