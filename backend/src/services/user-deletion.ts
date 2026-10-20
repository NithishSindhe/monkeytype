import { deleteConfig } from "../dal/config";
import { deleteAllPresets } from "../dal/preset";
import { deleteAll as deleteAllResults } from "../dal/result";
import * as UserDAL from "../dal/user";

/**
 * Delete all Monkeytype data of the given user.
 *
 * The account itself lives in Clerk and is shared with the other
 * solsticebase apps, so it is deliberately left alone.
 */
export async function deleteUserAccount(uid: string): Promise<void> {
  await Promise.all([
    UserDAL.deleteUser(uid),
    deleteAllPresets(uid),
    deleteConfig(uid),
    deleteAllResults(uid),
  ]);
}
