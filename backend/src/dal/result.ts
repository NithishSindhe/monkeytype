import MonkeyError from "../utils/error";
import { getDb } from "../init/sql";
import { getUser, getTags } from "./user";
import { DBResult } from "../utils/result";
import { tryCatch } from "@monkeytype/util/trycatch";
import { isUuid } from "../utils/misc";
import { Mode, Mode2 } from "@monkeytype/schemas/shared";
import { ChartData, KeyStats } from "@monkeytype/schemas/results";
import { FunboxName, Difficulty } from "@monkeytype/schemas/configs";
import { Language } from "@monkeytype/schemas/languages";

type ResultRow = {
  id: string;
  uid: string;
  timestamp: string | number;
  wpm: number;
  raw_wpm: number;
  acc: number;
  consistency: number;
  key_consistency: number;
  char_stats: [number, number, number, number];
  mode: string;
  mode2: Mode2<Mode>;
  test_duration: number;
  quote_length: number | null;
  restart_count: number | null;
  incomplete_test_seconds: number | null;
  afk_duration: number | null;
  tags: string[] | null;
  bailed_out: boolean | null;
  blind_mode: boolean | null;
  lazy_mode: boolean | null;
  funbox: string[] | null;
  language: string | null;
  difficulty: string | null;
  numbers: boolean | null;
  punctuation: boolean | null;
  is_pb: boolean | null;
  name: string | null;
  chart_data?: ChartData | "toolong" | null;
  key_spacing_stats?: KeyStats | null;
  key_duration_stats?: KeyStats | null;
};

/** Drops the keys the database stores as null so the shape matches the API. */
function withoutNulls<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== null && v !== undefined),
  ) as T;
}

function toResult(row: ResultRow): DBResult {
  return withoutNulls({
    _id: row.id,
    uid: row.uid,
    wpm: row.wpm,
    rawWpm: row.raw_wpm,
    charStats: row.char_stats,
    acc: row.acc,
    mode: row.mode as Mode,
    mode2: row.mode2,
    timestamp: Number(row.timestamp),
    testDuration: row.test_duration,
    consistency: row.consistency,
    keyConsistency: row.key_consistency,
    quoteLength: row.quote_length,
    restartCount: row.restart_count,
    incompleteTestSeconds: row.incomplete_test_seconds,
    afkDuration: row.afk_duration,
    tags: row.tags,
    bailedOut: row.bailed_out,
    blindMode: row.blind_mode,
    lazyMode: row.lazy_mode,
    funbox: row.funbox as FunboxName[] | null,
    language: row.language as Language | null,
    difficulty: row.difficulty as Difficulty | null,
    numbers: row.numbers,
    punctuation: row.punctuation,
    isPb: row.is_pb,
    name: row.name,
    chartData: row.chart_data,
    keySpacingStats: row.key_spacing_stats,
    keyDurationStats: row.key_duration_stats,
  } as unknown as DBResult);
}

const SELECT_FULL = `
  id, uid, timestamp, wpm, raw_wpm, acc, consistency, key_consistency,
  char_stats, mode, mode2, test_duration, quote_length, restart_count,
  incomplete_test_seconds, afk_duration, tags, bailed_out, blind_mode,
  lazy_mode, funbox, language, difficulty, numbers, punctuation, is_pb, name,
  chart_data, key_spacing_stats, key_duration_stats
`;

// the list endpoint leaves out the heavy per-key data and the chart points
const SELECT_MINIFIED = `
  id, uid, timestamp, wpm, raw_wpm, acc, consistency, key_consistency,
  char_stats, mode, mode2, test_duration, quote_length, restart_count,
  incomplete_test_seconds, afk_duration, tags, bailed_out, blind_mode,
  lazy_mode, funbox, language, difficulty, numbers, punctuation, is_pb
`;

export async function addResult(
  uid: string,
  result: DBResult,
): Promise<{ insertedId: string }> {
  const { data: user } = await tryCatch(getUser(uid, "add result"));
  if (!user) throw new MonkeyError(404, "User not found", "add result");

  const sql = getDb();
  const rows = await sql`
    insert into results (
      uid, timestamp, wpm, raw_wpm, acc, consistency, key_consistency,
      char_stats, mode, mode2, test_duration, quote_length, restart_count,
      incomplete_test_seconds, afk_duration, tags, bailed_out, blind_mode,
      lazy_mode, funbox, language, difficulty, numbers, punctuation, is_pb,
      name, chart_data, key_spacing_stats, key_duration_stats
    ) values (
      ${uid},
      ${result.timestamp},
      ${result.wpm},
      ${result.rawWpm},
      ${result.acc},
      ${result.consistency},
      ${result.keyConsistency},
      ${result.charStats},
      ${result.mode},
      ${result.mode2},
      ${result.testDuration},
      ${result.quoteLength ?? null},
      ${result.restartCount ?? null},
      ${result.incompleteTestSeconds ?? null},
      ${result.afkDuration ?? null},
      ${result.tags ?? null},
      ${result.bailedOut ?? null},
      ${result.blindMode ?? null},
      ${result.lazyMode ?? null},
      ${result.funbox ?? null},
      ${result.language ?? null},
      ${result.difficulty ?? null},
      ${result.numbers ?? null},
      ${result.punctuation ?? null},
      ${result.isPb ?? null},
      ${result.name ?? null},
      ${result.chartData === undefined ? null : JSON.stringify(result.chartData)}::jsonb,
      ${result.keySpacingStats === undefined ? null : JSON.stringify(result.keySpacingStats)}::jsonb,
      ${result.keyDurationStats === undefined ? null : JSON.stringify(result.keyDurationStats)}::jsonb
    )
    returning id
  `;

  return { insertedId: rows[0]?.["id"] as string };
}

export async function deleteAll(uid: string): Promise<void> {
  const sql = getDb();
  await sql`delete from results where uid = ${uid}`;
}

export async function updateTags(
  uid: string,
  resultId: string,
  tags: string[],
): Promise<void> {
  if (!isUuid(resultId)) throw new MonkeyError(404, "Result not found");

  const sql = getDb();
  const existing =
    await sql`select id from results where id = ${resultId} and uid = ${uid}`;
  if (existing.length === 0) throw new MonkeyError(404, "Result not found");

  const userTagIds = new Set((await getTags(uid)).map((tag) => tag._id));
  if (tags.some((tagId) => !userTagIds.has(tagId))) {
    throw new MonkeyError(422, "One of the tag id's is not valid");
  }

  await sql`
    update results set tags = ${tags} where id = ${resultId} and uid = ${uid}
  `;
}

export async function getResult(uid: string, id: string): Promise<DBResult> {
  if (!isUuid(id)) throw new MonkeyError(404, "Result not found");

  const sql = getDb();
  const rows = (await sql.query(
    `select ${SELECT_FULL} from results where id = $1 and uid = $2`,
    [id, uid],
  )) as ResultRow[];

  const row = rows[0];
  if (row === undefined) throw new MonkeyError(404, "Result not found");
  return toResult(row);
}

export async function getLastResult(uid: string): Promise<DBResult> {
  const sql = getDb();
  const rows = (await sql.query(
    `select ${SELECT_FULL} from results where uid = $1 order by timestamp desc limit 1`,
    [uid],
  )) as ResultRow[];

  const row = rows[0];
  if (row === undefined) throw new MonkeyError(404, "No last result found");
  return toResult(row);
}

export async function getLastResultTimestamp(uid: string): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    select timestamp from results where uid = ${uid}
    order by timestamp desc limit 1
  `;

  const row = rows[0];
  if (row === undefined) throw new MonkeyError(404, "No last result found");
  return Number(row["timestamp"]);
}

export async function getResultByTimestamp(
  uid: string,
  timestamp: number,
): Promise<DBResult | null> {
  const sql = getDb();
  const rows = (await sql.query(
    `select ${SELECT_FULL} from results where uid = $1 and timestamp = $2`,
    [uid, timestamp],
  )) as ResultRow[];

  const row = rows[0];
  return row === undefined ? null : toResult(row);
}

type GetResultsOpts = {
  onOrAfterTimestamp?: number;
  limit?: number;
  offset?: number;
};

export async function getResults(
  uid: string,
  opts?: GetResultsOpts,
): Promise<DBResult[]> {
  const { onOrAfterTimestamp, offset, limit } = opts ?? {};
  const sql = getDb();

  const hasTimestamp =
    onOrAfterTimestamp !== undefined &&
    onOrAfterTimestamp !== null &&
    !isNaN(onOrAfterTimestamp);

  const rows = (await sql.query(
    `select ${SELECT_MINIFIED} from results
     where uid = $1 and ($2::bigint is null or timestamp >= $2::bigint)
     order by timestamp desc
     limit $3::int offset $4::int`,
    [uid, hasTimestamp ? onOrAfterTimestamp : null, limit ?? null, offset ?? 0],
  )) as ResultRow[];

  return rows.map(toResult);
}
