import { deleteConfig } from "../dal/config";
import { deleteAllPresets } from "../dal/preset";
import { deleteAll as deleteAllResults } from "../dal/result";
import * as UserDAL from "../dal/user";
import * as AuthUtil from "../utils/auth";
import { isFirebaseError } from "../utils/error";

/**
 * Delete all data of the given user, including their authentication.
 * Missing user data is ignored so partially deleted users can be cleaned up.
 */
export async function deleteUserAccount(uid: string): Promise<void> {
  //cleanup database
  await Promise.all([
    UserDAL.deleteUser(uid),
    deleteAllPresets(uid),
    deleteConfig(uid),
    deleteAllResults(uid),
  ]);

  try {
    //delete user from firebase
    await AuthUtil.deleteUser(uid);
  } catch (e) {
    if (isFirebaseError(e) && e.errorInfo.code === "auth/user-not-found") {
      //user was already deleted, ok to ignore
    } else {
      throw e;
    }
  }
}
