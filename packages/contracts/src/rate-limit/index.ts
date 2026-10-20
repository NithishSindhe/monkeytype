export type Window = "second" | "minute" | "hour" | "day" | number;
export type RateLimitOptions = {
  /** Timeframe or time in milliseconds */
  window: Window;
  /** Max request within the given window */
  max: number;
};

export const limits = {
  // Config Routing
  configUpdate: {
    window: "hour",
    max: 500,
  },
  configGet: {
    window: "hour",
    max: 120,
  },
  configDelete: {
    window: "hour",
    max: 120,
  },
  // Quote favorites
  quoteFavoriteGet: {
    window: 30 * 60 * 1000, // 30 minutes
    max: 50,
  },
  quoteFavoritePost: {
    window: 30 * 60 * 1000, // 30 minutes
    max: 50,
  },
  quoteFavoriteDelete: {
    window: 30 * 60 * 1000, // 30 minutes
    max: 50,
  },
  // Presets Routing
  presetsGet: {
    window: "hour",
    max: 60,
  },
  presetsAdd: {
    window: "hour",
    max: 60,
  },
  presetsRemove: {
    window: "hour",
    max: 60,
  },
  presetsEdit: {
    window: "hour",
    max: 60,
  },
  // Results Routing
  resultByIdGet: {
    window: "hour",
    max: 300,
  },
  resultsGet: {
    window: "hour",
    max: 60,
  },
  resultsAdd: {
    window: "hour",
    max: 300,
  },
  resultsTagsUpdate: {
    window: "hour",
    max: 100,
  },
  // Users Routing
  userGet: {
    window: "hour",
    max: 60,
  },
  setStreakHourOffset: {
    window: "hour",
    max: 5,
  },
  userSignup: {
    window: "day",
    max: 2,
  },
  userDelete: {
    window: "day",
    max: 3,
  },
  userReset: {
    window: "day",
    max: 3,
  },
  userCheckName: {
    window: "minute",
    max: 60,
  },
  userUpdateName: {
    window: "day",
    max: 3,
  },
  userUpdateEmail: {
    window: "hour",
    max: 60,
  },
  userClearPB: {
    window: "hour",
    max: 60,
  },
  userCustomFilterAdd: {
    window: "hour",
    max: 60,
  },
  userCustomFilterRemove: {
    window: "hour",
    max: 60,
  },
  userTagsGet: {
    window: "hour",
    max: 60,
  },
  userTagsRemove: {
    window: "hour",
    max: 30,
  },
  userTagsClearPB: {
    window: "hour",
    max: 60,
  },
  userTagsEdit: {
    window: "hour",
    max: 30,
  },
  userTagsAdd: {
    window: "hour",
    max: 30,
  },
  userCustomThemeGet: {
    window: "hour",
    max: 30,
  },
  userCustomThemeAdd: {
    window: "hour",
    max: 30,
  },
  userCustomThemeRemove: {
    window: "hour",
    max: 30,
  },
  userCustomThemeEdit: {
    window: "hour",
    max: 30,
  },
  userRequestVerificationEmail: {
    window: 15 * 60 * 1000, //15 minutes
    max: 1,
  },
  userForgotPasswordEmail: {
    window: "minute",
    max: 1,
  },
  userRevokeAllTokens: {
    window: "hour",
    max: 10,
  },
  userProfileGet: {
    window: "hour",
    max: 100,
  },
  userProfileUpdate: {
    window: "hour",
    max: 60,
  },
  userTestActivity: {
    window: "hour",
    max: 60,
  },
  userCurrentTestActivity: {
    window: "hour",
    max: 60,
  },
  userStreak: {
    window: "hour",
    max: 60,
  },
} satisfies Record<string, RateLimitOptions>;

export type RateLimiterId = keyof typeof limits;

export function getLimits(limit: RateLimiterId): {
  limiter: RateLimitOptions;
} {
  return { limiter: limits[limit] };
}
