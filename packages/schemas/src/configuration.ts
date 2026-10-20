import { z } from "zod";

export const ConfigurationSchema = z.object({
  maintenance: z.boolean(),
  dev: z.object({
    responseSlowdownMs: z.number().int().nonnegative(),
  }),
  quotes: z.object({
    maxFavorites: z.number().int().nonnegative(),
  }),
  results: z.object({
    savingEnabled: z.boolean(),
    objectHashCheckEnabled: z.boolean(),
    filterPresets: z.object({
      enabled: z.boolean(),
      maxPresetsPerUser: z.number().int().nonnegative(),
    }),
    limits: z.object({
      regularUser: z.number().int().nonnegative(),
      premiumUser: z.number().int().nonnegative(),
    }),
    maxBatchSize: z.number().int().nonnegative(),
  }),
  users: z.object({
    signUp: z.boolean(),
    lastHashesCheck: z.object({
      enabled: z.boolean(),
      maxHashes: z.number().int().nonnegative(),
    }),
    autoBan: z.object({
      enabled: z.boolean(),
      maxCount: z.number().int().nonnegative(),
      maxHours: z.number().int().nonnegative(),
    }),
    profiles: z.object({
      enabled: z.boolean(),
    }),
    xp: z.object({
      enabled: z.boolean(),
      funboxBonus: z.number(),
      gainMultiplier: z.number(),
      maxDailyBonus: z.number(),
      minDailyBonus: z.number(),
      streak: z.object({
        enabled: z.boolean(),
        maxStreakDays: z.number().nonnegative(),
        maxStreakMultiplier: z.number(),
      }),
    }),
    premium: z.object({
      enabled: z.boolean(),
    }),
  }),
  rateLimiting: z.object({
    badAuthentication: z.object({
      enabled: z.boolean(),
      penalty: z.number(),
      flaggedStatusCodes: z.array(z.number().int().nonnegative()),
    }),
  }),
});
export type Configuration = z.infer<typeof ConfigurationSchema>;
