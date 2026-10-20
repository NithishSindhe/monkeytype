import { usersContract } from "@monkeytype/contracts/users";
import { initServer } from "@ts-rest/express";
import * as UserController from "../controllers/user";
import { callController } from "../ts-rest-adapter";

const s = initServer();
export default s.router(usersContract, {
  get: {
    handler: async (r) => callController(UserController.getUser)(r),
  },
  create: {
    handler: async (r) => callController(UserController.createNewUser)(r),
  },
  getNameAvailability: {
    handler: async (r) => callController(UserController.checkName)(r),
  },
  delete: {
    handler: async (r) => callController(UserController.deleteUser)(r),
  },
  reset: {
    handler: async (r) => callController(UserController.resetUser)(r),
  },
  updateName: {
    handler: async (r) => callController(UserController.updateName)(r),
  },
  getPersonalBests: {
    handler: async (r) => callController(UserController.getPersonalBests)(r),
  },
  deletePersonalBests: {
    handler: async (r) => callController(UserController.clearPb)(r),
  },
  addResultFilterPreset: {
    handler: async (r) =>
      callController(UserController.addResultFilterPreset)(r),
  },
  removeResultFilterPreset: {
    handler: async (r) =>
      callController(UserController.removeResultFilterPreset)(r),
  },
  getTags: {
    handler: async (r) => callController(UserController.getTags)(r),
  },
  createTag: {
    handler: async (r) => callController(UserController.addTag)(r),
  },
  editTag: {
    handler: async (r) => callController(UserController.editTag)(r),
  },
  deleteTag: {
    handler: async (r) => callController(UserController.removeTag)(r),
  },
  deleteTagPersonalBest: {
    handler: async (r) => callController(UserController.clearTagPb)(r),
  },
  getCustomThemes: {
    handler: async (r) => callController(UserController.getCustomThemes)(r),
  },
  addCustomTheme: {
    handler: async (r) => callController(UserController.addCustomTheme)(r),
  },
  deleteCustomTheme: {
    handler: async (r) => callController(UserController.removeCustomTheme)(r),
  },
  editCustomTheme: {
    handler: async (r) => callController(UserController.editCustomTheme)(r),
  },
  getStats: {
    handler: async (r) => callController(UserController.getStats)(r),
  },
  setStreakHourOffset: {
    handler: async (r) => callController(UserController.setStreakHourOffset)(r),
  },
  getFavoriteQuotes: {
    handler: async (r) => callController(UserController.getFavoriteQuotes)(r),
  },
  addQuoteToFavorites: {
    handler: async (r) => callController(UserController.addFavoriteQuote)(r),
  },
  removeQuoteFromFavorites: {
    handler: async (r) => callController(UserController.removeFavoriteQuote)(r),
  },
  getProfile: {
    handler: async (r) => callController(UserController.getProfile)(r),
  },
  updateProfile: {
    handler: async (r) => callController(UserController.updateProfile)(r),
  },
  revokeAllTokens: {
    handler: async (r) => callController(UserController.revokeAllTokens)(r),
  },
  getTestActivity: {
    handler: async (r) => callController(UserController.getTestActivity)(r),
  },
  getCurrentTestActivity: {
    handler: async (r) =>
      callController(UserController.getCurrentTestActivity)(r),
  },
  getStreak: {
    handler: async (r) => callController(UserController.getStreak)(r),
  },
});
