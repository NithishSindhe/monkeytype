import { initContract } from "@ts-rest/core";
import { configsContract } from "./configs";
import { presetsContract } from "./presets";
import { resultsContract } from "./results";
import { configurationContract } from "./configuration";
import { devContract } from "./dev";
import { usersContract } from "./users";

const c = initContract();

export const contract = c.router({
  configs: configsContract,
  presets: presetsContract,
  results: resultsContract,
  configuration: configurationContract,
  dev: devContract,
  users: usersContract,
});

/**
 * Whenever there is a breaking change with old frontend clients increase this number.
 * This will inform the frontend to refresh.
 */
export const COMPATIBILITY_CHECK = 6;
export const COMPATIBILITY_CHECK_HEADER = "X-Compatibility-Check";
