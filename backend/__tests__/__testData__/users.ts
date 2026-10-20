import * as UserDAL from "../../src/dal/user";
import { getDb } from "../../src/init/sql";
import { PersonalBest } from "@monkeytype/schemas/shared";
import { clerkUid } from "./ids";

/** DBUser field -> users column. Tags are not here, they live in their own table. */
const COLUMNS: Partial<Record<keyof UserDAL.DBUser, string>> = {
  name: "name",
  email: "email",
  addedAt: "added_at",
  completedTests: "completed_tests",
  startedTests: "started_tests",
  timeTyping: "time_typing",
  xp: "xp",
  bananas: "bananas",
  personalBests: "personal_bests",
  streak: "streak",
  profileDetails: "profile_details",
  customThemes: "custom_themes",
  resultFilterPresets: "result_filter_presets",
  favoriteQuotes: "favorite_quotes",
  inventory: "inventory",
  premium: "premium",
  testActivity: "test_activity",
  banned: "banned",
  verified: "verified",
  needsToChangeName: "needs_to_change_name",
  suspicious: "suspicious",
  note: "note",
  ips: "ips",
  nameHistory: "name_history",
  lastNameChange: "last_name_change",
  autoBanTimestamps: "auto_ban_timestamps",
  lastReultHashes: "last_result_hashes",
};

const JSONB_COLUMNS = new Set([
  "personal_bests",
  "streak",
  "profile_details",
  "custom_themes",
  "result_filter_presets",
  "favorite_quotes",
  "inventory",
  "premium",
  "test_activity",
]);

/**
 * Creates a user and then forces the given fields onto the row, so tests can
 * set up state the DAL has no api for.
 */
export async function createUser(
  user?: Partial<UserDAL.DBUser>,
): Promise<UserDAL.DBUser> {
  const uid = clerkUid();
  await UserDAL.addUser(`user${uid}`, `${uid}@example.com`, uid);
  await updateUser(uid, user);
  return await UserDAL.getUser(uid, "test");
}

/** Writes the given fields straight onto the row. */
export async function updateUser(
  uid: string,
  user?: Partial<UserDAL.DBUser>,
): Promise<void> {
  const sql = getDb();

  const assignments: string[] = [];
  const values: unknown[] = [uid];

  for (const [key, value] of Object.entries(user ?? {})) {
    if (key === "tags" || key === "uid") continue;
    // an explicitly undefined field means "leave it at its default"
    if (value === undefined) continue;

    const column = COLUMNS[key as keyof UserDAL.DBUser];
    if (column === undefined) {
      throw new Error(`createUser cannot set "${key}"`);
    }

    values.push(
      JSONB_COLUMNS.has(column) && value !== undefined && value !== null
        ? JSON.stringify(value)
        : (value ?? null),
    );
    assignments.push(
      JSONB_COLUMNS.has(column)
        ? `${column} = $${values.length}::jsonb`
        : `${column} = $${values.length}`,
    );
  }

  if (assignments.length > 0) {
    await sql.query(
      `update users set ${assignments.join(", ")} where uid = $1`,
      values,
    );
  }

  // tags live in their own table, and keep the ids the caller asked for
  for (const tag of user?.tags ?? []) {
    await sql.query(
      `insert into tags (id, uid, name, personal_bests)
       values ($1, $2, $3, $4::jsonb)`,
      [
        tag._id,
        uid,
        tag.name,
        JSON.stringify(
          tag.personalBests ?? {
            time: {},
            words: {},
            quote: {},
            zen: {},
            custom: {},
          },
        ),
      ],
    );
  }
}

export function pb(
  wpm: number,
  acc: number = 90,
  timestamp: number = 1,
): PersonalBest {
  return {
    acc,
    consistency: 100,
    difficulty: "normal",
    lazyMode: false,
    language: "english",
    punctuation: false,
    raw: wpm + 1,
    wpm,
    timestamp,
  };
}
