import { canFunboxGetPb, checkAndUpdatePb } from "../utils/pb";
import { getDb } from "../init/sql";
import MonkeyError from "../utils/error";
import { isPlainObject, isUuid } from "../utils/misc";
import { getCachedConfiguration } from "../init/configuration";
import { getDayOfYear } from "date-fns";
import { UTCDate } from "@date-fns/utc";
import {
  CustomTheme,
  UserInventory,
  UserProfileDetails,
  UserStreak,
  ResultFilters,
  UserTag,
  User,
  CountByYearAndDay,
} from "@monkeytype/schemas/users";
import { Mode, PersonalBest, PersonalBests } from "@monkeytype/schemas/shared";
import { Result as ResultType } from "@monkeytype/schemas/results";
import { isToday, isYesterday } from "@monkeytype/util/date-and-time";

export type DBUserTag = UserTag;
export type DBCustomTheme = CustomTheme;

export type DBUser = Omit<User, "isPremium" | "testActivity"> & {
  resultFilterPresets?: ResultFilters[];
  tags?: DBUserTag[];
  customThemes?: CustomTheme[];
  autoBanTimestamps?: number[];
  ips?: string[];
  nameHistory?: string[];
  lastNameChange?: number;
  bananas?: number;
  testActivity?: CountByYearAndDay;
  suspicious?: boolean;
  note?: string;
};

const SECONDS_PER_HOUR = 3600;
const MAX_TAGS = 15;
const MAX_CUSTOM_THEMES = 20;

type Result = Omit<ResultType<Mode>, "_id" | "name">;

const EMPTY_PERSONAL_BESTS: PersonalBests = {
  time: {},
  words: {},
  quote: {},
  zen: {},
  custom: {},
};

type UserRow = Record<string, unknown>;

function toNumber(value: unknown): number {
  return typeof value === "string" ? Number(value) : (value as number);
}

/** Maps a users row onto the shape the rest of the backend expects. */
function toUser(row: UserRow, tags?: DBUserTag[]): DBUser {
  const user: DBUser = {
    uid: row["uid"] as string,
    name: row["name"] as string,
    email: row["email"] as string,
    addedAt: toNumber(row["added_at"]),
    personalBests: (row["personal_bests"] as PersonalBests) ?? {
      ...EMPTY_PERSONAL_BESTS,
    },
    completedTests: row["completed_tests"] as number,
    startedTests: row["started_tests"] as number,
    timeTyping: row["time_typing"] as number,
    xp: toNumber(row["xp"]),
    bananas: row["bananas"] as number,
    favoriteQuotes:
      (row["favorite_quotes"] as DBUser["favoriteQuotes"]) ?? undefined,
    customThemes: (row["custom_themes"] as CustomTheme[]) ?? undefined,
    resultFilterPresets:
      (row["result_filter_presets"] as ResultFilters[]) ?? undefined,
    testActivity: (row["test_activity"] as CountByYearAndDay) ?? undefined,
    ips: (row["ips"] as string[]) ?? undefined,
    nameHistory: (row["name_history"] as string[]) ?? undefined,
    autoBanTimestamps: (
      (row["auto_ban_timestamps"] as (string | number)[]) ?? undefined
    )?.map(toNumber),
    lastReultHashes: (row["last_result_hashes"] as string[]) ?? undefined,
  };

  const optional: [keyof DBUser, unknown][] = [
    ["streak", row["streak"]],
    ["profileDetails", row["profile_details"]],
    ["inventory", row["inventory"]],
    ["premium", row["premium"]],
    ["banned", row["banned"] === true ? true : undefined],
    ["verified", row["verified"] ?? undefined],
    [
      "needsToChangeName",
      row["needs_to_change_name"] === true ? true : undefined,
    ],
    ["suspicious", row["suspicious"] === true ? true : undefined],
    ["note", row["note"] ?? undefined],
    [
      "lastNameChange",
      row["last_name_change"] === null || row["last_name_change"] === undefined
        ? undefined
        : toNumber(row["last_name_change"]),
    ],
  ];

  const writable = user as Record<string, unknown>;
  for (const [key, value] of optional) {
    if (value !== null && value !== undefined) {
      writable[key] = value;
    }
  }

  if (tags !== undefined) user.tags = tags;

  return user;
}

function toTag(row: UserRow): DBUserTag {
  return {
    _id: row["id"] as string,
    name: row["name"] as string,
    personalBests:
      (row["personal_bests"] as PersonalBests) ?? EMPTY_PERSONAL_BESTS,
  };
}

async function fetchTags(uid: string): Promise<DBUserTag[]> {
  const sql = getDb();
  const rows = await sql`
    select id, name, personal_bests from tags where uid = ${uid} order by name asc
  `;
  return rows.map((row) => toTag(row));
}

export async function addUser(
  name: string,
  email: string,
  uid: string,
): Promise<void> {
  const sql = getDb();
  const rows = await sql`
    insert into users (uid, name, email, added_at)
    values (${uid}, ${name}, ${email}, ${Date.now()})
    on conflict (uid) do nothing
    returning uid
  `;

  if (rows.length === 0) {
    throw new MonkeyError(409, "User document already exists", "addUser");
  }
}

export async function deleteUser(uid: string): Promise<void> {
  const sql = getDb();
  await sql`delete from users where uid = ${uid}`;
}

export async function resetUser(uid: string): Promise<void> {
  const sql = getDb();
  await sql`
    update users set
      personal_bests = ${JSON.stringify(EMPTY_PERSONAL_BESTS)}::jsonb,
      completed_tests = 0,
      started_tests = 0,
      time_typing = 0,
      bananas = 0,
      xp = 0,
      profile_details = ${JSON.stringify({ bio: "", keyboard: "", socialProfiles: {} })}::jsonb,
      favorite_quotes = '{}'::jsonb,
      custom_themes = '[]'::jsonb,
      result_filter_presets = '[]'::jsonb,
      streak = ${JSON.stringify({ length: 0, lastResultTimestamp: 0, maxLength: 0 })}::jsonb,
      test_activity = '{}'::jsonb
    where uid = ${uid}
  `;
  await sql`delete from tags where uid = ${uid}`;
}

export async function updateName(
  uid: string,
  name: string,
  previousName: string,
): Promise<void> {
  if (name === previousName) {
    throw new MonkeyError(400, "New name is the same as the old name");
  }

  if (
    name?.toLowerCase() !== previousName?.toLowerCase() &&
    !(await isNameAvailable(name, uid))
  ) {
    throw new MonkeyError(409, "Username already taken", name);
  }

  const sql = getDb();
  await sql`
    update users set
      name = ${name},
      last_name_change = ${Date.now()},
      needs_to_change_name = false,
      name_history = array_append(name_history, ${previousName})
    where uid = ${uid}
  `;
}

export async function flagForNameChange(uid: string): Promise<void> {
  const sql = getDb();
  await sql`update users set needs_to_change_name = true where uid = ${uid}`;
}

export async function clearPb(uid: string): Promise<void> {
  const sql = getDb();
  await sql`
    update users set personal_bests = ${JSON.stringify(EMPTY_PERSONAL_BESTS)}::jsonb
    where uid = ${uid}
  `;
}

export async function updateEmail(
  uid: string,
  email: string,
): Promise<boolean> {
  const sql = getDb();
  const rows =
    await sql`update users set email = ${email} where uid = ${uid} returning uid`;
  if (rows.length === 0) {
    throw new MonkeyError(404, "User not found", "update email");
  }
  return true;
}

export async function getUser(uid: string, stack: string): Promise<DBUser> {
  const sql = getDb();
  const rows = await sql`select * from users where uid = ${uid}`;
  const row = rows[0];
  if (row === undefined) throw new MonkeyError(404, "User not found", stack);

  return toUser(row, await fetchTags(uid));
}

/**
 * Get a user only containing the requested fields.
 * @throws MonkeyError if the user does not exist
 */
export async function getPartialUser<K extends keyof DBUser>(
  uid: string,
  stack: string,
  fields: K[],
): Promise<Pick<DBUser, K>> {
  const sql = getDb();
  const rows = await sql`select * from users where uid = ${uid}`;
  const row = rows[0];
  if (row === undefined) throw new MonkeyError(404, "User not found", stack);

  const tags = fields.includes("tags" as K) ? await fetchTags(uid) : undefined;
  const user = toUser(row, tags);

  const partial: Partial<DBUser> = {};
  for (const field of fields) {
    if (user[field] !== undefined) partial[field] = user[field];
  }

  if (fields.includes("personalBests" as K)) {
    partial.personalBests ??= { ...EMPTY_PERSONAL_BESTS };
  }

  return partial as Pick<DBUser, K>;
}

export async function findByName(name: string): Promise<DBUser | undefined> {
  const sql = getDb();
  const rows =
    await sql`select * from users where lower(name) = lower(${name})`;
  const row = rows[0];
  if (row === undefined) return undefined;

  return toUser(row, await fetchTags(row["uid"] as string));
}

export async function isNameAvailable(
  name: string,
  uid: string,
): Promise<boolean> {
  const sql = getDb();
  const rows =
    await sql`select uid from users where lower(name) = lower(${name})`;
  const row = rows[0];
  // the same user keeping their name but changing its casing is allowed
  return row === undefined || row["uid"] === uid;
}

export async function getUserByName(
  name: string,
  stack: string,
): Promise<DBUser> {
  const user = await findByName(name);
  if (!user) throw new MonkeyError(404, "User not found", stack);
  return user;
}

export async function addResultFilterPreset(
  uid: string,
  resultFilter: ResultFilters,
  maxFiltersPerUser: number,
): Promise<string> {
  if (maxFiltersPerUser === 0) {
    throw new MonkeyError(
      409,
      "Maximum number of custom filters reached",
      "add result filter preset",
    );
  }

  const sql = getDb();
  const _id = crypto.randomUUID();
  const preset = { ...resultFilter, _id };

  const rows = await sql`
    update users
    set result_filter_presets = result_filter_presets || ${JSON.stringify([preset])}::jsonb
    where uid = ${uid}
      and jsonb_array_length(result_filter_presets) < ${maxFiltersPerUser}
    returning uid
  `;

  if (rows.length === 0) {
    throw new MonkeyError(
      409,
      "Maximum number of custom filters reached",
      "add result filter preset",
    );
  }

  return _id;
}

export async function removeResultFilterPreset(
  uid: string,
  _id: string,
): Promise<void> {
  const sql = getDb();
  const rows = await sql`
    update users
    set result_filter_presets = (
      select coalesce(jsonb_agg(preset), '[]'::jsonb)
      from jsonb_array_elements(result_filter_presets) preset
      where preset->>'_id' <> ${_id}
    )
    where uid = ${uid}
      and result_filter_presets @> ${JSON.stringify([{ _id }])}::jsonb
    returning uid
  `;

  if (rows.length === 0) {
    throw new MonkeyError(
      404,
      "Custom filter not found",
      "remove result filter preset",
    );
  }
}

export async function addTag(uid: string, name: string): Promise<DBUserTag> {
  const sql = getDb();
  const rows = await sql`
    insert into tags (uid, name)
    select ${uid}, ${name}
    where (select count(*) from tags where uid = ${uid}) < ${MAX_TAGS}
    returning id, name, personal_bests
  `;

  const row = rows[0];
  if (row === undefined) {
    throw new MonkeyError(400, "Maximum number of tags reached", "add tag");
  }

  return toTag(row);
}

export async function getTags(uid: string): Promise<DBUserTag[]> {
  return await fetchTags(uid);
}

export async function editTag(
  uid: string,
  _id: string,
  name: string,
): Promise<void> {
  if (!isUuid(_id)) throw new MonkeyError(404, "Tag not found", "edit tag");

  const sql = getDb();
  const rows = await sql`
    update tags set name = ${name} where id = ${_id} and uid = ${uid} returning id
  `;
  if (rows.length === 0) {
    throw new MonkeyError(404, "Tag not found", "edit tag");
  }
}

export async function removeTag(uid: string, _id: string): Promise<void> {
  if (!isUuid(_id)) throw new MonkeyError(404, "Tag not found", "remove tag");

  const sql = getDb();
  const rows = await sql`
    delete from tags where id = ${_id} and uid = ${uid} returning id
  `;
  if (rows.length === 0) {
    throw new MonkeyError(404, "Tag not found", "remove tag");
  }
}

export async function removeTagPb(uid: string, _id: string): Promise<void> {
  if (!isUuid(_id)) {
    throw new MonkeyError(404, "Tag not found", "remove tag pb");
  }

  const sql = getDb();
  const rows = await sql`
    update tags set personal_bests = ${JSON.stringify(EMPTY_PERSONAL_BESTS)}::jsonb
    where id = ${_id} and uid = ${uid}
    returning id
  `;
  if (rows.length === 0) {
    throw new MonkeyError(404, "Tag not found", "remove tag pb");
  }
}

export async function checkIfPb(
  uid: string,
  user: Pick<DBUser, "personalBests">,
  result: Result,
): Promise<boolean> {
  const { mode } = result;

  if (!canFunboxGetPb(result)) return false;
  if (
    "stopOnLetter" in result &&
    result.stopOnLetter === true &&
    result.acc < 100
  ) {
    return false;
  }

  if (mode === "quote") {
    return false;
  }

  user.personalBests ??= { ...EMPTY_PERSONAL_BESTS };
  const pb = checkAndUpdatePb(user.personalBests, result);

  if (!pb.isPb) return false;

  const sql = getDb();
  await sql`
    update users set personal_bests = ${JSON.stringify(pb.personalBests)}::jsonb
    where uid = ${uid}
  `;
  return true;
}

export async function checkIfTagPb(
  uid: string,
  user: Pick<DBUser, "tags">,
  result: Result,
): Promise<string[]> {
  if (user.tags === undefined || user.tags.length === 0) {
    return [];
  }

  const { mode, tags: resultTags } = result;
  if (!canFunboxGetPb(result)) return [];
  if (
    "stopOnLetter" in result &&
    result.stopOnLetter === true &&
    result.acc < 100
  ) {
    return [];
  }

  if (mode === "quote") {
    return [];
  }

  const resultTagIds = new Set(resultTags ?? []);
  const tagsToCheck = user.tags.filter((tag) => resultTagIds.has(tag._id));

  const sql = getDb();
  const ret: string[] = [];

  for (const tag of tagsToCheck) {
    tag.personalBests ??= { ...EMPTY_PERSONAL_BESTS };

    const tagpb = checkAndUpdatePb(tag.personalBests, result);
    if (tagpb.isPb) {
      ret.push(tag._id);
      await sql`
        update tags set personal_bests = ${JSON.stringify(tagpb.personalBests)}::jsonb
        where id = ${tag._id} and uid = ${uid}
      `;
    }
  }

  return ret;
}

export async function resetPb(uid: string): Promise<void> {
  const sql = getDb();
  const rows = await sql`
    update users set personal_bests = ${JSON.stringify(EMPTY_PERSONAL_BESTS)}::jsonb
    where uid = ${uid}
    returning uid
  `;
  if (rows.length === 0) {
    throw new MonkeyError(404, "User not found", "reset pb");
  }
}

export async function updateLastHashes(
  uid: string,
  lastHashes: string[],
): Promise<void> {
  const sql = getDb();
  await sql`
    update users set last_result_hashes = ${lastHashes} where uid = ${uid}
  `;
}

export async function updateTypingStats(
  uid: string,
  restartCount: number,
  timeTyping: number,
): Promise<void> {
  const sql = getDb();
  await sql`
    update users set
      started_tests = started_tests + ${restartCount + 1},
      completed_tests = completed_tests + 1,
      time_typing = time_typing + ${timeTyping}
    where uid = ${uid}
  `;
}

export async function incrementBananas(
  uid: string,
  wpm: number,
): Promise<void> {
  const { personalBests } = await getPartialUser(uid, "increment bananas", [
    "personalBests",
  ]);

  const time60 = personalBests?.time?.["60"] ?? [];
  if (time60.length === 0) return;

  // only counts when within 75% of the best time 60 pb
  const best = Math.max(...time60.map((pb) => pb.wpm));
  if (wpm < best * 0.75) return;

  const sql = getDb();
  await sql`update users set bananas = bananas + 1 where uid = ${uid}`;
}

export async function incrementXp(uid: string, xp: number): Promise<void> {
  if (isNaN(xp)) xp = 0;
  const sql = getDb();
  await sql`update users set xp = xp + ${xp} where uid = ${uid}`;
}

export async function incrementTestActivity(
  user: DBUser,
  timestamp: number,
): Promise<void> {
  const date = new UTCDate(timestamp);
  const dayIndex = getDayOfYear(date) - 1;
  const year = date.getFullYear().toString();

  const sql = getDb();
  // grow the year's array up to the day, then bump that day's counter
  await sql`
    update users set test_activity = jsonb_set(
      jsonb_set(
        coalesce(test_activity, '{}'::jsonb),
        array[${year}],
        (
          select coalesce(jsonb_agg(coalesce(value, 'null'::jsonb)), '[]'::jsonb)
          from (
            select (coalesce(test_activity->${year}, '[]'::jsonb))->i as value
            from generate_series(
              0,
              greatest(
                ${dayIndex},
                jsonb_array_length(coalesce(test_activity->${year}, '[]'::jsonb)) - 1
              )
            ) as i
          ) grown
        ),
        true
      ),
      array[${year}, ${dayIndex.toString()}],
      to_jsonb(
        coalesce(
          -- the day is an array index, so it has to be read with an integer
          -- key. A text key on a json array always yields null.
          (test_activity->${year}->>${dayIndex}::int)::int,
          0
        ) + 1
      ),
      true
    )
    where uid = ${user.uid}
  `;
}

export async function addTheme(
  uid: string,
  { name, colors }: Omit<CustomTheme, "_id">,
): Promise<{ _id: string; name: string }> {
  const _id = crypto.randomUUID();

  const sql = getDb();
  const rows = await sql`
    update users
    set custom_themes = custom_themes || ${JSON.stringify([{ _id, name, colors }])}::jsonb
    where uid = ${uid}
      and jsonb_array_length(custom_themes) < ${MAX_CUSTOM_THEMES}
    returning uid
  `;

  if (rows.length === 0) {
    throw new MonkeyError(
      409,
      "Maximum number of custom themes reached",
      "add theme",
    );
  }

  return { _id, name };
}

export async function removeTheme(uid: string, id: string): Promise<void> {
  const sql = getDb();
  const rows = await sql`
    update users
    set custom_themes = (
      select coalesce(jsonb_agg(theme), '[]'::jsonb)
      from jsonb_array_elements(custom_themes) theme
      where theme->>'_id' <> ${id}
    )
    where uid = ${uid} and custom_themes @> ${JSON.stringify([{ _id: id }])}::jsonb
    returning uid
  `;

  if (rows.length === 0) {
    throw new MonkeyError(404, "Custom theme not found", "remove theme");
  }
}

export async function editTheme(
  uid: string,
  id: string,
  { name, colors }: Omit<CustomTheme, "_id">,
): Promise<void> {
  const sql = getDb();
  const rows = await sql`
    update users
    set custom_themes = (
      select coalesce(jsonb_agg(
        case when theme->>'_id' = ${id}
          then theme || ${JSON.stringify({ name, colors })}::jsonb
          else theme
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(custom_themes) theme
    )
    where uid = ${uid} and custom_themes @> ${JSON.stringify([{ _id: id }])}::jsonb
    returning uid
  `;

  if (rows.length === 0) {
    throw new MonkeyError(404, "Custom theme not found", "edit theme");
  }
}

export async function getThemes(uid: string): Promise<DBCustomTheme[]> {
  const user = await getPartialUser(uid, "get themes", ["customThemes"]);
  return user.customThemes ?? [];
}

export async function getPersonalBests(
  uid: string,
  mode: string,
  mode2?: string,
): Promise<PersonalBest> {
  const user = await getPartialUser(uid, "get personal bests", [
    "personalBests",
  ]);

  if (mode2 !== undefined) {
    // oxlint-disable-next-line no-unsafe-member-access
    return user.personalBests?.[mode]?.[mode2] as PersonalBest;
  }

  return user.personalBests?.[mode] as PersonalBest;
}

export async function getStats(
  uid: string,
): Promise<Pick<DBUser, "startedTests" | "completedTests" | "timeTyping">> {
  return await getPartialUser(uid, "get stats", [
    "startedTests",
    "completedTests",
    "timeTyping",
  ]);
}

export async function getFavoriteQuotes(
  uid: string,
): Promise<NonNullable<DBUser["favoriteQuotes"]>> {
  const user = await getPartialUser(uid, "get favorite quotes", [
    "favoriteQuotes",
  ]);

  return user.favoriteQuotes ?? {};
}

export async function addFavoriteQuote(
  uid: string,
  language: string,
  quoteId: string,
  maxQuotes: number,
): Promise<void> {
  const favorites = await getFavoriteQuotes(uid);
  const total = Object.values(favorites).reduce(
    (sum, ids) => sum + (ids?.length ?? 0),
    0,
  );

  if (total >= maxQuotes) {
    throw new MonkeyError(
      409,
      "Maximum number of favorite quotes reached",
      "add favorite quote",
    );
  }

  const forLanguage = (favorites[language] ?? []) as string[];
  if (forLanguage.includes(quoteId)) return;

  const sql = getDb();
  await sql`
    update users
    set favorite_quotes = jsonb_set(
      favorite_quotes,
      array[${language}],
      ${JSON.stringify([...forLanguage, quoteId])}::jsonb,
      true
    )
    where uid = ${uid}
  `;
}

export async function removeFavoriteQuote(
  uid: string,
  language: string,
  quoteId: string,
): Promise<void> {
  const favorites = await getFavoriteQuotes(uid);
  const forLanguage = favorites[language] as string[] | undefined;
  if (forLanguage === undefined) return;

  const sql = getDb();
  await sql`
    update users
    set favorite_quotes = jsonb_set(
      favorite_quotes,
      array[${language}],
      ${JSON.stringify(forLanguage.filter((id) => id !== quoteId))}::jsonb,
      true
    )
    where uid = ${uid}
  `;
}

export async function recordAutoBanEvent(
  uid: string,
  maxCount: number,
  maxHours: number,
): Promise<boolean> {
  const user = await getPartialUser(uid, "record auto ban event", [
    "banned",
    "autoBanTimestamps",
  ]);

  let ret = false;

  if (user.banned) return ret;

  const autoBanTimestamps = user.autoBanTimestamps ?? [];
  const now = Date.now();

  //only keep events within the last maxHours
  const recentAutoBanTimestamps = autoBanTimestamps.filter(
    (timestamp) => timestamp >= now - maxHours * SECONDS_PER_HOUR * 1000,
  );

  //push new event
  recentAutoBanTimestamps.push(now);

  const banned = recentAutoBanTimestamps.length > maxCount;
  if (banned) ret = true;

  const sql = getDb();
  await sql`
    update users set
      auto_ban_timestamps = ${recentAutoBanTimestamps}::bigint[],
      banned = banned or ${banned}
    where uid = ${uid}
  `;

  return ret;
}

export async function updateProfile(
  uid: string,
  profileDetailUpdates: Partial<UserProfileDetails>,
  inventory?: UserInventory,
): Promise<void> {
  const updates = Object.fromEntries(
    Object.entries(profileDetailUpdates).filter(
      ([, value]) =>
        value !== undefined &&
        !(isPlainObject(value) && Object.keys(value).length === 0),
    ),
  );

  const sql = getDb();
  await sql`
    update users set
      profile_details = coalesce(profile_details, '{}'::jsonb) || ${JSON.stringify(updates)}::jsonb,
      inventory = coalesce(${inventory === undefined ? null : JSON.stringify(inventory)}::jsonb, inventory)
    where uid = ${uid}
  `;
}

export async function updateStreak(
  uid: string,
  timestamp: number,
): Promise<number> {
  const user = await getPartialUser(uid, "calculate streak", ["streak"]);
  const streak: UserStreak = {
    lastResultTimestamp: user.streak?.lastResultTimestamp ?? 0,
    length: user.streak?.length ?? 0,
    maxLength: user.streak?.maxLength ?? 0,
    hourOffset: user.streak?.hourOffset,
  };

  if (isYesterday(streak.lastResultTimestamp, streak.hourOffset ?? 0)) {
    streak.length += 1;
  } else if (!isToday(streak.lastResultTimestamp, streak.hourOffset ?? 0)) {
    streak.length = 1;
  }

  if (streak.length > streak.maxLength) {
    streak.maxLength = streak.length;
  }

  streak.lastResultTimestamp = timestamp;

  if (user.streak?.hourOffset === 0) {
    delete streak.hourOffset;
  }

  const sql = getDb();
  await sql`
    update users set streak = ${JSON.stringify(streak)}::jsonb where uid = ${uid}
  `;

  return streak.length;
}

export async function setStreakHourOffset(
  uid: string,
  hourOffset: number,
): Promise<void> {
  const sql = getDb();
  await sql`
    update users set streak = coalesce(streak, '{}'::jsonb) || ${JSON.stringify(
      { hourOffset, lastResultTimestamp: Date.now() },
    )}::jsonb
    where uid = ${uid}
  `;
}

export async function setBanned(uid: string, banned: boolean): Promise<void> {
  const sql = getDb();
  await sql`update users set banned = ${banned} where uid = ${uid}`;
}

export async function clearStreakHourOffset(uid: string): Promise<void> {
  const sql = getDb();
  await sql`
    update users set streak = streak - 'hourOffset' where uid = ${uid}
  `;
}

export async function checkIfUserIsPremium(
  uid: string,
  userInfoOverride?: Pick<DBUser, "premium">,
): Promise<boolean> {
  const premiumFeaturesEnabled = (await getCachedConfiguration(true)).users
    .premium.enabled;
  if (!premiumFeaturesEnabled) {
    return false;
  }
  const user =
    userInfoOverride ??
    (await getPartialUser(uid, "checkIfUserIsPremium", ["premium"]));
  const expirationDate = user.premium?.expirationTimestamp;

  if (expirationDate === undefined) return false;
  if (expirationDate === -1) return true; //lifetime
  return expirationDate > Date.now();
}

export async function logIpAddress(
  uid: string,
  ip: string,
  userInfoOverride?: Pick<DBUser, "ips">,
): Promise<void> {
  const user =
    userInfoOverride ?? (await getPartialUser(uid, "logIpAddress", ["ips"]));
  const currentIps = [...(user.ips ?? [])];
  const ipIndex = currentIps.indexOf(ip);
  if (ipIndex !== -1) {
    currentIps.splice(ipIndex, 1);
  }
  currentIps.unshift(ip);
  if (currentIps.length > 10) {
    currentIps.pop();
  }

  const sql = getDb();
  await sql`update users set ips = ${currentIps} where uid = ${uid}`;
}
