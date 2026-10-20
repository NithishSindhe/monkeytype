import { MonkeyResponse } from "../../utils/monkey-response";
import * as UserDal from "../../dal/user";
import Clerk from "../../init/clerk";
import Logger from "../../utils/logger";
import * as DateUtils from "date-fns";
import { UTCDate } from "@date-fns/utc";
import { getDb } from "../../init/sql";
import MonkeyError from "../../utils/error";

import { Mode, PersonalBest, PersonalBests } from "@monkeytype/schemas/shared";
import {
  GenerateDataRequest,
  GenerateDataResponse,
} from "@monkeytype/contracts/dev";
import { roundTo2 } from "@monkeytype/util/numbers";
import { MonkeyRequest } from "../types";

const CREATE_RESULT_DEFAULT_OPTIONS = {
  firstTestTimestamp: DateUtils.startOfDay(new UTCDate(Date.now())).valueOf(),
  lastTestTimestamp: DateUtils.endOfDay(new UTCDate(Date.now())).valueOf(),
  minTestsPerDay: 0,
  maxTestsPerDay: 50,
};

type GeneratedResult = {
  uid: string;
  name: string;
  wpm: number;
  rawWpm: number;
  acc: number;
  consistency: number;
  mode: Mode;
  mode2: string;
  timestamp: number;
  testDuration: number;
};

export async function createTestData(
  req: MonkeyRequest<undefined, GenerateDataRequest>,
): Promise<GenerateDataResponse> {
  const { username, createUser } = req.body;
  const user = await getOrCreateUser(username, "password", createUser);

  const { uid, email } = user;

  await createTestResults(user, req.body);
  await updateUser(uid);

  return new MonkeyResponse("test data created", { uid, email });
}

async function getOrCreateUser(
  username: string,
  password: string,
  createUser = false,
): Promise<UserDal.DBUser> {
  const existingUser = await UserDal.findByName(username);

  if (existingUser !== undefined && existingUser !== null) {
    return existingUser;
  } else if (!createUser) {
    throw new MonkeyError(404, `User ${username} does not exist.`);
  }

  const email = `${username}@example.com`;
  Logger.success(`create user ${username}`);
  const created = await Clerk().users.createUser({
    username,
    password,
    emailAddress: [email],
    skipPasswordChecks: true,
  });
  const uid = created.id;

  await UserDal.addUser(username, email, uid);
  return UserDal.getUser(uid, "getOrCreateUser");
}

async function createTestResults(
  user: UserDal.DBUser,
  configOptions: GenerateDataRequest,
): Promise<void> {
  const config = {
    ...CREATE_RESULT_DEFAULT_OPTIONS,
    ...configOptions,
  };
  const start = toDate(config.firstTestTimestamp);
  const end = toDate(config.lastTestTimestamp);

  const days = DateUtils.eachDayOfInterval({
    start,
    end,
  }).map((day) => ({
    timestamp: DateUtils.startOfDay(day),
    amount: Math.round(random(config.minTestsPerDay, config.maxTestsPerDay)),
  }));

  const sql = getDb();

  for (const day of days) {
    Logger.success(
      `User ${user.name} insert ${day.amount} results on ${new Date(
        day.timestamp,
      )}`,
    );
    const results = createArray(day.amount, () =>
      createResult(user, day.timestamp),
    );

    for (const result of results) {
      await sql`
        insert into results (
          uid, timestamp, wpm, raw_wpm, acc, consistency, key_consistency,
          char_stats, mode, mode2, test_duration, language, name
        ) values (
          ${result.uid}, ${result.timestamp}, ${result.wpm}, ${result.rawWpm},
          ${result.acc}, ${result.consistency}, 33.18,
          ${[131, 0, 0, 0]}, ${result.mode}, ${result.mode2},
          ${result.testDuration}, 'english', ${result.name}
        )
      `;
    }
  }
}

function toDate(value: number): Date {
  return new UTCDate(value);
}

function random(min: number, max: number): number {
  return roundTo2(Math.random() * (max - min) + min);
}

function createResult(
  user: UserDal.DBUser,
  timestamp: Date, //evil, we modify this value
): GeneratedResult {
  const mode: Mode = randomValue(["time", "words"]);
  const mode2: number =
    mode === "time"
      ? randomValue([15, 30, 60, 120])
      : randomValue([10, 25, 50, 100]);
  const testDuration = mode2;

  timestamp = DateUtils.addSeconds(timestamp, testDuration);
  return {
    uid: user.uid,
    name: user.name,
    wpm: random(80, 120),
    rawWpm: random(80, 120),
    acc: random(80, 100),
    consistency: random(80, 100),
    mode,
    mode2: mode2.toString(),
    timestamp: timestamp.valueOf(),
    testDuration,
  };
}

async function updateUser(uid: string): Promise<void> {
  const sql = getDb();

  const stats = await sql`
    select
      language, mode, mode2,
      sum(test_duration) as time_typing,
      count(*)::int as completed_tests,
      max(wpm) as best_wpm
    from results
    where uid = ${uid}
    group by language, mode, mode2
  `;

  const timeTyping = stats.reduce(
    (sum, row) => sum + Number(row["time_typing"]),
    0,
  );
  const completedTests = stats.reduce(
    (sum, row) => sum + Number(row["completed_tests"]),
    0,
  );

  const personalBests: PersonalBests = {
    time: {},
    custom: {},
    words: {},
    zen: {},
    quote: {},
  };

  for (const row of stats) {
    const mode = row["mode"] as keyof PersonalBests;
    const mode2 = row["mode2"] as string;

    const bestRows = await sql`
      select * from results
      where uid = ${uid}
        and mode = ${row["mode"] as string}
        and mode2 = ${mode2}
      order by wpm desc, timestamp asc
      limit 1
    `;
    const best = bestRows[0];
    if (best === undefined) continue;

    personalBests[mode] ??= {};
    personalBests[mode][mode2] ??= [];

    (personalBests[mode][mode2] as PersonalBest[]).push({
      acc: best["acc"] as number,
      consistency: best["consistency"] as number,
      difficulty: "normal",
      lazyMode: false,
      language: (row["language"] as string) ?? "english",
      punctuation: false,
      raw: best["raw_wpm"] as number,
      wpm: best["wpm"] as number,
      numbers: false,
      timestamp: Number(best["timestamp"]),
    } as PersonalBest);
  }

  await updateTestActivity(uid);

  await sql`
    update users set
      time_typing = ${timeTyping},
      completed_tests = ${completedTests},
      started_tests = ${Math.round(completedTests * 1.25)},
      personal_bests = ${JSON.stringify(personalBests)}::jsonb
    where uid = ${uid}
  `;
}

function randomValue<T>(values: T[]): T {
  const rnd = Math.round(Math.random() * (values.length - 1));
  return values[rnd] as T;
}

function createArray<T>(size: number, builder: () => T): T[] {
  return new Array(size).fill(0).map(() => builder());
}

async function updateTestActivity(uid: string): Promise<void> {
  const sql = getDb();

  const rows = await sql`
    select
      extract(year from to_timestamp(timestamp / 1000.0) at time zone 'utc')::int as year,
      extract(doy  from to_timestamp(timestamp / 1000.0) at time zone 'utc')::int as day,
      count(*)::int as tests
    from results
    where uid = ${uid}
    group by year, day
  `;

  const testActivity: Record<string, (number | null)[]> = {};
  for (const row of rows) {
    const year = String(row["year"]);
    const dayIndex = Number(row["day"]) - 1;
    const days = (testActivity[year] ??= []);
    while (days.length <= dayIndex) days.push(null);
    days[dayIndex] = Number(row["tests"]);
  }

  await sql`
    update users set test_activity = ${JSON.stringify(testActivity)}::jsonb
    where uid = ${uid}
  `;
}
