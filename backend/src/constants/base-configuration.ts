import { Configuration } from "@monkeytype/schemas/configuration";

/**
 * This is the base schema for the configuration of the API backend.
 * To add a new configuration. Simply add it to this object.
 * When changing this template, please follow the principle of "Secure by default" (https://en.wikipedia.org/wiki/Secure_by_default).
 */
export const BASE_CONFIGURATION: Configuration = {
  maintenance: false,
  dev: {
    responseSlowdownMs: 0,
  },
  results: {
    savingEnabled: false,
    objectHashCheckEnabled: false,
    filterPresets: {
      enabled: false,
      maxPresetsPerUser: 0,
    },
    limits: {
      regularUser: 1000,
      premiumUser: 10000,
    },
    maxBatchSize: 1000,
  },
  quotes: {
    maxFavorites: 0,
  },
  users: {
    signUp: false,
    lastHashesCheck: {
      enabled: false,
      maxHashes: 0,
    },
    autoBan: {
      enabled: false,
      maxCount: 5,
      maxHours: 1,
    },
    profiles: {
      enabled: false,
    },
    xp: {
      enabled: false,
      funboxBonus: 0,
      gainMultiplier: 0,
      maxDailyBonus: 0,
      minDailyBonus: 0,
      streak: {
        enabled: false,
        maxStreakDays: 0,
        maxStreakMultiplier: 0,
      },
    },
    premium: {
      enabled: false,
    },
  },
  rateLimiting: {
    badAuthentication: {
      enabled: false,
      penalty: 0,
      flaggedStatusCodes: [],
    },
  },
};
