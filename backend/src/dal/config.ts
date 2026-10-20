import { getDb } from "../init/sql";
import { Config, PartialConfig } from "@monkeytype/schemas/configs";

export type DBConfig = {
  uid: string;
  config: PartialConfig;
};

/**
 * Config keys that no longer exist in the schema but may still be stored in
 * the jsonb of old rows. Stripped on read and dropped from the row on save.
 */
const REMOVED_CONFIG_KEYS: string[] = ["ads"];

export function stripRemovedConfigKeys<T extends object>(config: T): T {
  return Object.fromEntries(
    Object.entries(config).filter(
      ([key]) => !REMOVED_CONFIG_KEYS.includes(key),
    ),
  ) as T;
}

export async function saveConfig(
  uid: string,
  config: Partial<Config>,
): Promise<void> {
  const sql = getDb();
  await sql`
    insert into configs (uid, config)
    values (${uid}, ${JSON.stringify(config)}::jsonb)
    on conflict (uid) do update set config = (configs.config - ${REMOVED_CONFIG_KEYS}::text[]) || excluded.config
  `;
}

export async function getConfig(uid: string): Promise<DBConfig | null> {
  const sql = getDb();
  const rows = await sql`select uid, config from configs where uid = ${uid}`;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    uid: row["uid"] as string,
    config: stripRemovedConfigKeys(row["config"] as PartialConfig),
  };
}

export async function deleteConfig(uid: string): Promise<void> {
  const sql = getDb();
  await sql`delete from configs where uid = ${uid}`;
}
