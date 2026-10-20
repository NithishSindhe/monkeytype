import * as UserDAL from "../../dal/user";
import MonkeyError from "../../utils/error";
import { MonkeyResponse } from "../../utils/monkey-response";
import { buildAgentLog, omit, sanitizeString } from "../../utils/misc";
import { deleteAllPresets } from "../../dal/preset";
import { deleteAll as deleteAllResults } from "../../dal/result";
import { deleteConfig } from "../../dal/config";
import { deleteUserAccount } from "../../services/user-deletion";
import * as AuthUtil from "../../utils/auth";
import * as Dates from "date-fns";
import { UTCDateMini } from "@date-fns/utc";
import {
  ResultFilters,
  User,
  UserProfile,
  CountByYearAndDay,
  TestActivity,
  UserProfileDetails,
} from "@monkeytype/schemas/users";
import {
  AddCustomThemeRequest,
  AddCustomThemeResponse,
  AddFavoriteQuoteRequest,
  AddResultFilterPresetRequest,
  AddResultFilterPresetResponse,
  AddTagRequest,
  AddTagResponse,
  CheckNamePathParameters,
  CheckNameResponse,
  CreateUserRequest,
  DeleteCustomThemeRequest,
  EditCustomThemeRequst,
  EditTagRequest,
  GetCurrentTestActivityResponse,
  GetCustomThemesResponse,
  GetFavoriteQuotesResponse,
  GetPersonalBestsQuery,
  GetPersonalBestsResponse,
  GetProfilePathParams,
  GetProfileQuery,
  GetProfileResponse,
  GetStatsResponse,
  GetStreakResponse,
  GetTagsResponse,
  GetTestActivityResponse,
  GetUserResponse,
  RemoveFavoriteQuoteRequest,
  RemoveResultFilterPresetPathParams,
  SetStreakHourOffsetRequest,
  TagIdPathParams,
  UpdateUserNameRequest,
  UpdateUserProfileRequest,
  UpdateUserProfileResponse,
} from "@monkeytype/contracts/users";
import { MILLISECONDS_IN_DAY } from "@monkeytype/util/date-and-time";
import { MonkeyRequest } from "../types";
import { tryCatch } from "@monkeytype/util/trycatch";
import { PersonalBest } from "@monkeytype/schemas/shared";

export async function createNewUser(
  req: MonkeyRequest<undefined, CreateUserRequest>,
): Promise<MonkeyResponse> {
  const { name } = req.body;
  const { uid } = req.ctx.decodedToken;

  const available = await UserDAL.isNameAvailable(name, uid);
  if (!available) {
    throw new MonkeyError(409, "Username unavailable");
  }

  // the account is shared across apps, so the email lives in clerk
  const email = await AuthUtil.getUserEmail(uid);

  await UserDAL.addUser(name, email, uid);

  return new MonkeyResponse("User created", null);
}

export async function deleteUser(req: MonkeyRequest): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;

  await deleteUserAccount(uid);

  return new MonkeyResponse("User deleted", null);
}

export async function resetUser(req: MonkeyRequest): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;

  const userInfo = await UserDAL.getPartialUser(uid, "reset user", ["banned"]);
  if (userInfo.banned) {
    throw new MonkeyError(403, "Banned users cannot reset their account");
  }

  await Promise.all([
    UserDAL.resetUser(uid),
    deleteAllPresets(uid),
    deleteAllResults(uid),
    deleteConfig(uid),
  ]);

  return new MonkeyResponse("User reset", null);
}

export async function updateName(
  req: MonkeyRequest<undefined, UpdateUserNameRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { name } = req.body;

  const user = await UserDAL.getPartialUser(uid, "update name", [
    "name",
    "banned",
    "needsToChangeName",
    "lastNameChange",
  ]);

  if (user.banned) {
    throw new MonkeyError(403, "Banned users cannot change their name");
  }

  if (
    !user?.needsToChangeName &&
    Date.now() - (user.lastNameChange ?? 0) < MILLISECONDS_IN_DAY * 30
  ) {
    throw new MonkeyError(409, "You can change your name once every 30 days");
  }

  await UserDAL.updateName(uid, name, user.name);

  return new MonkeyResponse("User's name updated", null);
}

export async function clearPb(req: MonkeyRequest): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;

  await UserDAL.clearPb(uid);

  return new MonkeyResponse("User's PB cleared", null);
}

export async function checkName(
  req: MonkeyRequest<undefined, undefined, CheckNamePathParameters>,
): Promise<CheckNameResponse> {
  const { name } = req.params;
  const { uid } = req.ctx.decodedToken;

  const available = await UserDAL.isNameAvailable(name, uid);

  return new MonkeyResponse("Check username", {
    available,
  });
}

type RelevantUserInfo = Omit<
  UserDAL.DBUser,
  | "bananas"
  | "nameHistory"
  | "lastNameChange"
  | "lastReultHashes" //TODO fix typo
  | "note"
  | "ips"
  | "testActivity"
  | "suspicious"
>;

function getRelevantUserInfo(user: UserDAL.DBUser): RelevantUserInfo {
  return omit(user, [
    "bananas",
    "nameHistory",
    "lastNameChange",
    "lastReultHashes", //TODO fix typo
    "note",
    "ips",
    "testActivity",
    "suspicious",
  ]);
}

export async function getUser(req: MonkeyRequest): Promise<GetUserResponse> {
  const { uid } = req.ctx.decodedToken;

  const { data: userInfo, error } = await tryCatch(
    UserDAL.getUser(uid, "get user"),
  );

  if (error) {
    if (error instanceof MonkeyError && error.status === 404) {
      // signed in through another solsticebase app but no profile here yet
      throw new MonkeyError(
        404,
        "User not found, please pick a username to finish signing up.",
        "get user",
        uid,
      );
    }
    throw error;
  }

  userInfo.personalBests ??= {
    time: {},
    words: {},
    quote: {},
    zen: {},
    custom: {},
  };

  const agentLog = buildAgentLog(req);
  void UserDAL.logIpAddress(uid, agentLog.ip, userInfo);

  if (!userInfo.name) {
    userInfo.needsToChangeName = true;
    await UserDAL.flagForNameChange(uid);
  }

  const isPremium = await UserDAL.checkIfUserIsPremium(uid, userInfo);

  const testActivity = generateCurrentTestActivity(userInfo.testActivity);
  const relevantUserInfo = getRelevantUserInfo(userInfo);

  const resultFilterPresets: ResultFilters[] =
    relevantUserInfo.resultFilterPresets ?? [];
  delete relevantUserInfo.resultFilterPresets;

  const tags = relevantUserInfo.tags ?? [];
  delete relevantUserInfo.tags;

  const customThemes = relevantUserInfo.customThemes ?? [];
  delete relevantUserInfo.customThemes;

  const userData: User = {
    ...relevantUserInfo,
    resultFilterPresets,
    tags,
    customThemes,
    isPremium,
    testActivity,
  };

  return new MonkeyResponse("User data retrieved", userData);
}

export async function addResultFilterPreset(
  req: MonkeyRequest<undefined, AddResultFilterPresetRequest>,
): Promise<AddResultFilterPresetResponse> {
  const { uid } = req.ctx.decodedToken;
  const filter = req.body;
  const { maxPresetsPerUser } = req.ctx.configuration.results.filterPresets;

  const createdId = await UserDAL.addResultFilterPreset(
    uid,
    filter,
    maxPresetsPerUser,
  );
  return new MonkeyResponse("Result filter preset created", createdId);
}

export async function removeResultFilterPreset(
  req: MonkeyRequest<undefined, undefined, RemoveResultFilterPresetPathParams>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { presetId } = req.params;

  await UserDAL.removeResultFilterPreset(uid, presetId);
  return new MonkeyResponse("Result filter preset deleted", null);
}

export async function addTag(
  req: MonkeyRequest<undefined, AddTagRequest>,
): Promise<AddTagResponse> {
  const { uid } = req.ctx.decodedToken;
  const { tagName } = req.body;

  const tag = await UserDAL.addTag(uid, tagName);
  return new MonkeyResponse("Tag updated", tag);
}

export async function clearTagPb(
  req: MonkeyRequest<undefined, undefined, TagIdPathParams>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { tagId } = req.params;

  await UserDAL.removeTagPb(uid, tagId);
  return new MonkeyResponse("Tag PB cleared", null);
}

export async function editTag(
  req: MonkeyRequest<undefined, EditTagRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { tagId, newName } = req.body;

  await UserDAL.editTag(uid, tagId, newName);
  return new MonkeyResponse("Tag updated", null);
}

export async function removeTag(
  req: MonkeyRequest<undefined, undefined, TagIdPathParams>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { tagId } = req.params;

  await UserDAL.removeTag(uid, tagId);
  return new MonkeyResponse("Tag deleted", null);
}

export async function getTags(req: MonkeyRequest): Promise<GetTagsResponse> {
  const { uid } = req.ctx.decodedToken;

  const tags = await UserDAL.getTags(uid);
  return new MonkeyResponse("Tags retrieved", tags);
}

export async function getCustomThemes(
  req: MonkeyRequest,
): Promise<GetCustomThemesResponse> {
  const { uid } = req.ctx.decodedToken;
  const customThemes = await UserDAL.getThemes(uid);
  return new MonkeyResponse("Custom themes retrieved", customThemes);
}

export async function addCustomTheme(
  req: MonkeyRequest<undefined, AddCustomThemeRequest>,
): Promise<AddCustomThemeResponse> {
  const { uid } = req.ctx.decodedToken;
  const { name, colors } = req.body;

  const addedTheme = await UserDAL.addTheme(uid, { name, colors });
  return new MonkeyResponse("Custom theme added", addedTheme);
}

export async function removeCustomTheme(
  req: MonkeyRequest<undefined, DeleteCustomThemeRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { themeId } = req.body;
  await UserDAL.removeTheme(uid, themeId);
  return new MonkeyResponse("Custom theme removed", null);
}

export async function editCustomTheme(
  req: MonkeyRequest<undefined, EditCustomThemeRequst>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { themeId, theme } = req.body;

  await UserDAL.editTheme(uid, themeId, theme);
  return new MonkeyResponse("Custom theme updated", null);
}

export async function getPersonalBests(
  req: MonkeyRequest<GetPersonalBestsQuery>,
): Promise<GetPersonalBestsResponse> {
  const { uid } = req.ctx.decodedToken;
  const { mode, mode2 } = req.query;

  const data = (await UserDAL.getPersonalBests(uid, mode, mode2)) ?? null;
  return new MonkeyResponse("Personal bests retrieved", data);
}

export async function getStats(req: MonkeyRequest): Promise<GetStatsResponse> {
  const { uid } = req.ctx.decodedToken;

  const data = (await UserDAL.getStats(uid)) ?? null;
  return new MonkeyResponse("Personal stats retrieved", data);
}

export async function getFavoriteQuotes(
  req: MonkeyRequest,
): Promise<GetFavoriteQuotesResponse> {
  const { uid } = req.ctx.decodedToken;

  const quotes = await UserDAL.getFavoriteQuotes(uid);

  return new MonkeyResponse("Favorite quotes retrieved", quotes);
}

export async function addFavoriteQuote(
  req: MonkeyRequest<undefined, AddFavoriteQuoteRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;

  const { language, quoteId } = req.body;

  await UserDAL.addFavoriteQuote(
    uid,
    language,
    quoteId,
    req.ctx.configuration.quotes.maxFavorites,
  );

  return new MonkeyResponse("Quote added to favorites", null);
}

export async function removeFavoriteQuote(
  req: MonkeyRequest<undefined, RemoveFavoriteQuoteRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;

  const { quoteId, language } = req.body;
  await UserDAL.removeFavoriteQuote(uid, language, quoteId);

  return new MonkeyResponse("Quote removed from favorites", null);
}

export async function getProfile(
  req: MonkeyRequest<GetProfileQuery, undefined, GetProfilePathParams>,
): Promise<GetProfileResponse> {
  const { uidOrName } = req.params;

  const user = req.query.isUid
    ? await UserDAL.getUser(uidOrName, "get user profile")
    : await UserDAL.getUserByName(uidOrName, "get user profile");

  const {
    name,
    banned,
    inventory,
    profileDetails,
    personalBests,
    completedTests,
    startedTests,
    timeTyping,
    addedAt,
    xp,
    streak,
  } = user;

  const extractValid = (
    src: Record<string, PersonalBest[]>,
    validKeys: string[],
  ): Record<string, PersonalBest[]> => {
    return validKeys.reduce((obj, key) => {
      if (src?.[key] !== undefined) {
        obj[key] = src[key];
      }
      return obj;
    }, {});
  };

  const validTimePbs = extractValid(personalBests.time, [
    "15",
    "30",
    "60",
    "120",
  ]);
  const validWordsPbs = extractValid(personalBests.words, [
    "10",
    "25",
    "50",
    "100",
  ]);

  const typingStats = {
    completedTests,
    startedTests,
    timeTyping,
  };

  const relevantPersonalBests = {
    time: validTimePbs,
    words: validWordsPbs,
  };

  const baseProfile = {
    name,
    banned,
    addedAt,
    typingStats,
    personalBests: relevantPersonalBests,
    xp,
    streak: streak?.length ?? 0,
    maxStreak: streak?.maxLength ?? 0,
    isPremium: await UserDAL.checkIfUserIsPremium(user.uid, user),
  };

  if (banned) {
    return new MonkeyResponse("Profile retrived: banned user", baseProfile);
  }

  const profileData = {
    ...baseProfile,
    inventory,
    details: profileDetails,
    uid: user.uid,
  } as UserProfile;

  if (user.profileDetails?.showActivityOnPublicProfile) {
    profileData.testActivity = generateCurrentTestActivity(user.testActivity);
  } else {
    delete profileData.testActivity;
  }
  return new MonkeyResponse("Profile retrieved", profileData);
}

export async function updateProfile(
  req: MonkeyRequest<undefined, UpdateUserProfileRequest>,
): Promise<UpdateUserProfileResponse> {
  const { uid } = req.ctx.decodedToken;
  const {
    bio,
    keyboard,
    socialProfiles,
    selectedBadgeId,
    showActivityOnPublicProfile,
  } = req.body;

  const user = await UserDAL.getPartialUser(uid, "update user profile", [
    "banned",
    "inventory",
  ]);

  if (user.banned) {
    throw new MonkeyError(403, "Banned users cannot update their profile");
  }

  user.inventory?.badges.forEach((badge) => {
    if (badge.id === selectedBadgeId) {
      badge.selected = true;
    } else {
      delete badge.selected;
    }
  });

  const profileDetailsUpdates: Partial<UserProfileDetails> = {
    bio: sanitizeString(bio),
    keyboard: sanitizeString(keyboard),
    socialProfiles: Object.fromEntries(
      Object.entries(socialProfiles ?? {}).map(([key, value]) => [
        key,
        sanitizeString(value),
      ]),
    ),
    showActivityOnPublicProfile,
  };

  await UserDAL.updateProfile(uid, profileDetailsUpdates, user.inventory);

  return new MonkeyResponse("Profile updated", profileDetailsUpdates);
}

export async function setStreakHourOffset(
  req: MonkeyRequest<undefined, SetStreakHourOffsetRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { hourOffset } = req.body;

  const user = await UserDAL.getPartialUser(uid, "update user profile", [
    "streak",
  ]);

  if (
    user.streak?.hourOffset !== undefined &&
    user.streak?.hourOffset !== null
  ) {
    throw new MonkeyError(403, "Streak hour offset already set");
  }

  await UserDAL.setStreakHourOffset(uid, hourOffset);

  return new MonkeyResponse("Streak hour offset set", null);
}

export async function revokeAllTokens(
  req: MonkeyRequest,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  await AuthUtil.revokeTokensByUid(uid);
  return new MonkeyResponse("All tokens revoked", null);
}

export function generateCurrentTestActivity(
  testActivity: CountByYearAndDay | undefined,
): TestActivity | undefined {
  const thisYear = Dates.startOfYear(new UTCDateMini());
  const lastYear = Dates.startOfYear(Dates.subYears(thisYear, 1));

  let thisYearData = testActivity?.[thisYear.getFullYear().toString()];
  let lastYearData = testActivity?.[lastYear.getFullYear().toString()];

  if (lastYearData === undefined && thisYearData === undefined) {
    return undefined;
  }

  lastYearData = lastYearData ?? [];
  thisYearData = thisYearData ?? [];

  //make sure lastYearData covers the full year
  if (lastYearData.length < Dates.getDaysInYear(lastYear)) {
    lastYearData.push(
      ...(new Array(Dates.getDaysInYear(lastYear) - lastYearData.length).fill(
        undefined,
      ) as (number | null)[]),
    );
  }
  //use enough days of the last year to have 372 days in total to always fill the first week of the graph
  lastYearData = lastYearData.slice(-372 + thisYearData.length);

  const lastDay = Dates.startOfDay(
    Dates.addDays(thisYear, thisYearData.length - 1),
  );

  return {
    testsByDays: [...lastYearData, ...thisYearData],
    lastDay: lastDay.valueOf(),
  };
}

export async function getTestActivity(
  req: MonkeyRequest,
): Promise<GetTestActivityResponse> {
  const { uid } = req.ctx.decodedToken;
  const premiumFeaturesEnabled = req.ctx.configuration.users.premium.enabled;
  const user = await UserDAL.getPartialUser(uid, "testActivity", [
    "testActivity",
    "premium",
  ]);
  const userHasPremium = await UserDAL.checkIfUserIsPremium(uid, user);

  if (!premiumFeaturesEnabled) {
    throw new MonkeyError(503, "Premium features are disabled");
  }

  if (!userHasPremium) {
    throw new MonkeyError(503, "User does not have premium");
  }

  return new MonkeyResponse(
    "Test activity data retrieved",
    user.testActivity ?? null,
  );
}

export async function getCurrentTestActivity(
  req: MonkeyRequest,
): Promise<GetCurrentTestActivityResponse> {
  const { uid } = req.ctx.decodedToken;

  const user = await UserDAL.getPartialUser(uid, "current test activity", [
    "testActivity",
  ]);
  const data = generateCurrentTestActivity(user.testActivity);
  return new MonkeyResponse(
    "Current test activity data retrieved",
    data ?? null,
  );
}

export async function getStreak(
  req: MonkeyRequest,
): Promise<GetStreakResponse> {
  const { uid } = req.ctx.decodedToken;

  const user = await UserDAL.getPartialUser(uid, "streak", ["streak"]);

  return new MonkeyResponse("Streak data retrieved", user.streak ?? null);
}
