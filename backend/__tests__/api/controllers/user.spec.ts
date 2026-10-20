import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import { setup } from "../../__testData__/controller-test";
import * as Configuration from "../../../src/init/configuration";
import { generateCurrentTestActivity } from "../../../src/api/controllers/user";
import * as UserDal from "../../../src/dal/user";
import * as AuthUtils from "../../../src/utils/auth";
import * as PresetDal from "../../../src/dal/preset";
import * as ConfigDal from "../../../src/dal/config";
import * as ResultDal from "../../../src/dal/result";
import * as Captcha from "../../../src/utils/captcha";
import { ObjectId } from "mongodb";
import { PersonalBest } from "@monkeytype/schemas/shared";
import { UserStreak } from "@monkeytype/schemas/users";
import { isFirebaseError } from "../../../src/utils/error";
import { pb } from "../../__testData__/users";

const { mockApp, uid, mockAuth } = setup();
const configuration = Configuration.getCachedConfiguration();

describe("user controller test", () => {
  describe("user signup", () => {
    const firebaseDeleteUserMock = vi.spyOn(AuthUtils, "deleteUser");
    const usernameAvailableMock = vi.spyOn(UserDal, "isNameAvailable");
    const verifyCaptchaMock = vi.spyOn(Captcha, "verify");
    beforeEach(async () => {
      await enableSignup(true);
      usernameAvailableMock.mockResolvedValue(true);
    });
    afterEach(() => {
      [firebaseDeleteUserMock, usernameAvailableMock].forEach((it) =>
        it.mockClear(),
      );
    });

    it("should fail if domain is blacklisted", async () => {
      for (const domain of ["tidal.lol", "selfbot.cc"]) {
        //GIVEN
        firebaseDeleteUserMock.mockResolvedValue();
        mockAuth.modifyToken({
          email: `newuser@${domain}`,
        });

        const newUser = {
          name: "NewUser",
          uid: uid,
          email: `newuser@${domain}`,
          captcha: "captcha",
        };

        //WHEN
        const result = await mockApp
          .post("/users/signup")
          .set("Authorization", `Bearer ${uid}`)
          .send(newUser)
          .set({
            Accept: "application/json",
          })
          .expect(400);

        //THEN
        expect(result.body.message).toEqual("Invalid domain");

        //user will be created in firebase from the frontend, make sure we remove it
        expect(firebaseDeleteUserMock).toHaveBeenCalledWith(uid);
      }
    });

    it("should fail if username is taken", async () => {
      //GIVEN
      usernameAvailableMock.mockResolvedValue(false);
      firebaseDeleteUserMock.mockResolvedValue();

      const newUser = {
        name: "NewUser",
        uid: uid,
        email: "newuser@mail.com",
        captcha: "captcha",
      };

      //WHEN
      const result = await mockApp
        .post("/users/signup")
        .set("Authorization", `Bearer ${uid}`)
        .send(newUser)
        .expect(409);

      //THEN
      expect(result.body.message).toEqual("Username unavailable");
      expect(usernameAvailableMock).toHaveBeenCalledWith("NewUser", uid);

      //user will be created in firebase from the frontend, make sure we remove it
      expect(firebaseDeleteUserMock).toHaveBeenCalledWith(uid);
    });
    it("should fail if capture is invalid", async () => {
      //GIVEN
      verifyCaptchaMock.mockResolvedValue(false);

      const newUser = {
        name: "NewUser",
        uid: uid,
        email: "newuser@mail.com",
        captcha: "captcha",
      };

      //WHEN
      const { body } = await mockApp
        .post("/users/signup")
        .set("Authorization", `Bearer ${uid}`)
        .send(newUser)
        .expect(422);

      //THEN
      expect(body.message).toEqual("Captcha challenge failed");
    });
    it("should fail if username too long", async () => {
      //GIVEN
      const newUser = {
        uid: uid,
        email: "newuser@mail.com",
        captcha: "captcha",
      };

      //WHEN
      const { body } = await mockApp
        .post("/users/signup")
        .set("Authorization", `Bearer ${uid}`)
        .send({ ...newUser, name: new Array(17).fill("x").join("") })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"name" String must contain at most 16 character(s)',
        ],
      });
    });
    it("should fail if username contains disallowed word", async () => {
      //GIVEN
      const newUser = {
        uid: uid,
        email: "newuser@mail.com",
        captcha: "captcha",
      };

      //WHEN
      const { body } = await mockApp
        .post("/users/signup")
        .set("Authorization", `Bearer ${uid}`)
        .send({ ...newUser, name: "miodec" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"name" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (miodec).',
        ],
      });
    });
  });
  describe("checkName", () => {
    const userIsNameAvailableMock = vi.spyOn(UserDal, "isNameAvailable");

    beforeEach(() => {
      userIsNameAvailableMock.mockClear();
    });

    it("returns available if name is available", async () => {
      //GIVEN
      userIsNameAvailableMock.mockResolvedValue(true);

      //WHEN
      const { body } = await mockApp
        .get("/users/checkName/bob")
        //no authentication required
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Check username",
        data: { available: true },
      });
      expect(userIsNameAvailableMock).toHaveBeenCalledWith("bob", "");
    });

    it("returns taken if name is not available", async () => {
      //GIVEN
      userIsNameAvailableMock.mockResolvedValue(false);

      //WHEN
      const { body } = await mockApp
        .get("/users/checkName/bob")
        //no authentication required
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Check username",
        data: { available: false },
      });

      expect(userIsNameAvailableMock).toHaveBeenCalledWith("bob", "");
    });
    it("returns ok if name is our own", async () => {
      //GIVEN
      userIsNameAvailableMock.mockResolvedValue(true);

      //WHEN
      const { body } = await mockApp
        .get("/users/checkName/bob")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Check username",
        data: { available: true },
      });
      expect(userIsNameAvailableMock).toHaveBeenCalledWith("bob", uid);
    });
    it("returns 422 if username contains disallowed word", async () => {
      await mockApp
        .get("/users/checkName/newMiodec")
        //no authentication required
        .expect(422);
    });
  });
  describe("getTestActivity", () => {
    const getUserMock = vi.spyOn(UserDal, "getPartialUser");
    afterAll(() => {
      getUserMock.mockClear();
    });
    it("should return 503 for non premium users", async () => {
      //given
      getUserMock.mockResolvedValue({
        testActivity: { "2023": [1, 2, 3], "2024": [4, 5, 6] },
      } as Partial<UserDal.DBUser> as UserDal.DBUser);

      //when
      await mockApp
        .get("/users/testActivity")
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(503);
    });
    it("should send data for premium users", async () => {
      //given
      getUserMock.mockResolvedValue({
        testActivity: { "2023": [1, 2, 3], "2024": [4, 5, 6] },
      } as Partial<UserDal.DBUser> as UserDal.DBUser);
      vi.spyOn(UserDal, "checkIfUserIsPremium").mockResolvedValue(true);
      await enablePremiumFeatures(true);

      //when
      const response = await mockApp
        .get("/users/testActivity")
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //%hen
      const result = response.body.data;
      expect(result["2023"]).toEqual([1, 2, 3]);
      expect(result["2024"]).toEqual([4, 5, 6]);
    });
  });

  describe("generateCurrentTestActivity", () => {
    beforeAll(() => {
      vi.useFakeTimers().setSystemTime(1712102400000);
    });
    it("without any data", () => {
      expect(generateCurrentTestActivity(undefined)).toBeUndefined();
    });
    it("with current year only", () => {
      //given
      const data = {
        "2024": fillYearWithDay(94).map((it) => 2024000 + it),
      };

      //when
      const testActivity = generateCurrentTestActivity(data);

      //then
      expect(testActivity?.lastDay).toEqual(1712102400000);

      const testsByDays = testActivity?.testsByDays ?? [];
      expect(testsByDays).toHaveLength(372);
      expect(testsByDays[6]).toEqual(undefined); //2023-04-04
      expect(testsByDays[277]).toEqual(undefined); //2023-12-31
      expect(testsByDays[278]).toEqual(2024001); //2024-01-01
      expect(testsByDays[371]).toEqual(2024094); //2024-01
    });
    it("with current and last year", () => {
      //given
      const data = {
        "2023": fillYearWithDay(365).map((it) => 2023000 + it),
        "2024": fillYearWithDay(94).map((it) => 2024000 + it),
      };

      //when
      const testActivity = generateCurrentTestActivity(data);

      //then
      expect(testActivity?.lastDay).toEqual(1712102400000);

      const testsByDays = testActivity?.testsByDays ?? [];
      expect(testsByDays).toHaveLength(372);
      expect(testsByDays[6]).toEqual(2023094); //2023-04-04
      expect(testsByDays[277]).toEqual(2023365); //2023-12-31
      expect(testsByDays[278]).toEqual(2024001); //2024-01-01
      expect(testsByDays[371]).toEqual(2024094); //2024-01
    });
    it("with current and missing days of last year", () => {
      //given
      const data = {
        "2023": fillYearWithDay(20).map((it) => 2023000 + it),
        "2024": fillYearWithDay(94).map((it) => 2024000 + it),
      };

      //when
      const testActivity = generateCurrentTestActivity(data);

      //then
      expect(testActivity?.lastDay).toEqual(1712102400000);

      const testsByDays = testActivity?.testsByDays ?? [];
      expect(testsByDays).toHaveLength(372);
      expect(testsByDays[6]).toEqual(undefined); //2023-04-04
      expect(testsByDays[277]).toEqual(undefined); //2023-12-31
      expect(testsByDays[278]).toEqual(2024001); //2024-01-01
      expect(testsByDays[371]).toEqual(2024094); //2024-01
    });
  });
  describe("delete user ", () => {
    const deleteUserMock = vi.spyOn(UserDal, "deleteUser");
    const firebaseDeleteUserMock = vi.spyOn(AuthUtils, "deleteUser");
    const deleteAllPresetsMock = vi.spyOn(PresetDal, "deleteAllPresets");
    const deleteConfigMock = vi.spyOn(ConfigDal, "deleteConfig");
    const deleteAllResultMock = vi.spyOn(ResultDal, "deleteAll");

    beforeEach(() => {
      [
        firebaseDeleteUserMock,
        deleteUserMock,
        deleteAllPresetsMock,
        deleteConfigMock,
      ].forEach((it) => it.mockResolvedValue(undefined));

      deleteAllResultMock.mockResolvedValue({} as any);
    });

    afterEach(() => {
      [
        deleteUserMock,
        firebaseDeleteUserMock,
        deleteConfigMock,
        deleteAllResultMock,
        deleteAllPresetsMock,
      ].forEach((it) => it.mockClear());
    });

    it("should delete user", async () => {
      //WHEN
      await mockApp
        .delete("/users/")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(deleteUserMock).toHaveBeenCalledWith(uid);
      expect(firebaseDeleteUserMock).toHaveBeenCalledWith(uid);
      expect(deleteAllPresetsMock).toHaveBeenCalledWith(uid);
      expect(deleteConfigMock).toHaveBeenCalledWith(uid);
      expect(deleteAllResultMock).toHaveBeenCalledWith(uid);
    });

    it("should not fail if firebase user cannot be found", async () => {
      //GIVEN
      firebaseDeleteUserMock.mockRejectedValue({
        code: "user-not-found",
        codePrefix: "auth",
        errorInfo: { code: "auth/user-not-found", message: "user not found" },
      });

      //WHEN
      await mockApp
        .delete("/users/")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(deleteUserMock).toHaveBeenCalledWith(uid);
      expect(firebaseDeleteUserMock).toHaveBeenCalledWith(uid);
      expect(deleteAllPresetsMock).toHaveBeenCalledWith(uid);
      expect(deleteConfigMock).toHaveBeenCalledWith(uid);
      expect(deleteAllResultMock).toHaveBeenCalledWith(uid);
    });

    it("should fail for unknown error from firebase", async () => {
      //GIVEN
      firebaseDeleteUserMock.mockRejectedValue({
        code: "unknown",
        codePrefix: "auth",
        errorInfo: { code: "auth/unknown", message: "unknown" },
      });

      //WHEN
      await mockApp
        .delete("/users/")
        .set("Authorization", `Bearer ${uid}`)
        .expect(500);

      //THEN
      expect(deleteUserMock).toHaveBeenCalledWith(uid);
      expect(firebaseDeleteUserMock).toHaveBeenCalledWith(uid);
    });
  });
  describe("resetUser", () => {
    const getPartialUserMock = vi.spyOn(UserDal, "getPartialUser");
    const resetUserMock = vi.spyOn(UserDal, "resetUser");
    const deleteAllPresetsMock = vi.spyOn(PresetDal, "deleteAllPresets");
    const deleteAllResultsMock = vi.spyOn(ResultDal, "deleteAll");
    const deleteConfigMock = vi.spyOn(ConfigDal, "deleteConfig");

    beforeEach(() => {
      getPartialUserMock.mockClear().mockResolvedValue({
        banned: false,
        name: "bob",
        email: "bob@example.com",
      } as any);
      deleteAllResultsMock.mockClear().mockResolvedValue(null as any);
      [resetUserMock, deleteAllPresetsMock, deleteConfigMock].forEach((it) =>
        it.mockClear().mockResolvedValue(),
      );
    });

    it("should reset user", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/reset")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "User reset",
        data: null,
      });

      for (const it of [
        resetUserMock,
        deleteAllPresetsMock,
        deleteAllResultsMock,
        deleteConfigMock,
      ]) {
        expect(it).toHaveBeenCalledWith(uid);
      }
    });
    it("should fail resetting a banned user", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({ banned: true } as any);

      //WHEN
      const { body } = await mockApp
        .patch("/users/reset")
        .set("Authorization", `Bearer ${uid}`)
        .expect(403);

      //THEN
      expect(body.message).toEqual("Banned users cannot reset their account");
    });
  });
  describe("update name", () => {
    const getPartialUserMock = vi.spyOn(UserDal, "getPartialUser");
    const updateNameMock = vi.spyOn(UserDal, "updateName");

    beforeEach(() => {
      [getPartialUserMock, updateNameMock].forEach((it) => {
        it.mockClear().mockResolvedValue(null as never);
      });
    });

    it("should update the username", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({
        name: "Bob",
        lastNameChange: 1000,
      } as any);
      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "newName" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "User's name updated",
        data: null,
      });

      expect(updateNameMock).toHaveBeenCalledWith(uid, "newName", "Bob");
    });

    it("should fail for banned users", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({ banned: true } as any);

      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "newName" })
        .expect(403);

      //THEN
      expect(body.message).toEqual("Banned users cannot change their name");
      expect(updateNameMock).not.toHaveBeenCalled();
    });
    it("should fail changing name within last 30 days", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({
        lastNameChange: Date.now().valueOf() - 60_000,
      } as any);

      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "newName" })
        .expect(409);

      //THEN
      expect(body.message).toEqual(
        "You can change your name once every 30 days",
      );
      expect(updateNameMock).not.toHaveBeenCalled();
    });
    it("should update the username within 30 days if user needs to change", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({
        name: "Bob",
        lastNameChange: Date.now().valueOf() - 60_000,
        needsToChangeName: true,
      } as any);
      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "newName" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "User's name updated",
        data: null,
      });

      expect(updateNameMock).toHaveBeenCalledWith(uid, "newName", "Bob");
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"name" Required'],
      });
    });
    it("should fail without unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "newName", extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should fail if username contains disallowed word", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "miodec" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"name" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (miodec).',
        ],
      });
    });
  });
  describe("clear PBs", () => {
    const clearPbMock = vi.spyOn(UserDal, "clearPb");

    beforeEach(() => {
      clearPbMock.mockClear().mockResolvedValue();
    });

    it("should clear pb", async () => {
      //WHEN
      const { body } = await mockApp
        .delete("/users/personalBests")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "User's PB cleared",
        data: null,
      });
      expect(clearPbMock).toHaveBeenCalledWith(uid);
    });
  });
  describe("update email", () => {
    const authUpdateEmailMock = vi.spyOn(AuthUtils, "updateUserEmail");
    const userUpdateEmailMock = vi.spyOn(UserDal, "updateEmail");

    beforeEach(() => {
      [authUpdateEmailMock, userUpdateEmailMock].forEach((it) =>
        it.mockClear().mockResolvedValue(null as never),
      );
    });
    it("should update users email", async () => {
      //GIVEN
      const newEmail = "newEmail@example.com";

      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({ newEmail, previousEmail: "previousEmail@example.com" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Email updated",
        data: null,
      });

      expect(authUpdateEmailMock).toHaveBeenCalledWith(
        uid,
        newEmail.toLowerCase(),
      );
      expect(userUpdateEmailMock).toHaveBeenCalledWith(
        uid,
        newEmail.toLowerCase(),
      );
    });
    it("should fail for duplicate email", async () => {
      //GIVEN
      const mockFirebaseError = {
        code: "auth/email-already-exists",
        codePrefix: "auth",
        errorInfo: {
          code: "auth/email-already-exists",
          message: "Email already exists",
        },
      };
      authUpdateEmailMock.mockRejectedValue(mockFirebaseError);
      expect(isFirebaseError(mockFirebaseError)).toBe(true);

      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
        })
        .expect(409);

      expect(body.message).toEqual(
        "The email address is already in use by another account",
      );

      expect(userUpdateEmailMock).not.toHaveBeenCalled();
    });

    it("should fail for invalid email", async () => {
      //GIVEN
      const mockFirebaseError = {
        code: "auth/invalid-email",
        codePrefix: "auth",
        errorInfo: {
          code: "auth/invalid-email",
          message: "Invalid email",
        },
      };
      authUpdateEmailMock.mockRejectedValue(mockFirebaseError);
      expect(isFirebaseError(mockFirebaseError)).toBe(true);

      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
        })
        .expect(400);

      expect(body.message).toEqual("Invalid email address");

      expect(userUpdateEmailMock).not.toHaveBeenCalled();
    });
    it("should fail for too many requests", async () => {
      //GIVEN
      const mockFirebaseError = {
        code: "auth/too-many-requests",
        codePrefix: "auth",
        errorInfo: {
          code: "auth/too-many-requests",
          message: "Too many requests",
        },
      };
      authUpdateEmailMock.mockRejectedValue(mockFirebaseError);
      expect(isFirebaseError(mockFirebaseError)).toBe(true);

      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
        })
        .expect(429);

      expect(body.message).toEqual("Too many requests. Please try again later");

      expect(userUpdateEmailMock).not.toHaveBeenCalled();
    });
    it("should fail for unknown user", async () => {
      //GIVEN
      const mockFirebaseError = {
        code: "auth/user-not-found",
        codePrefix: "auth",
        errorInfo: {
          code: "auth/user-not-found",
          message: "User not found",
        },
      };
      authUpdateEmailMock.mockRejectedValue(mockFirebaseError);
      expect(isFirebaseError(mockFirebaseError)).toBe(true);

      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
        })
        .expect(404);

      expect(body.message).toEqual(
        "User not found in the auth system\nStack: update email",
      );

      expect(userUpdateEmailMock).not.toHaveBeenCalled();
    });
    it("should fail for invalid user token", async () => {
      //GIVEN
      authUpdateEmailMock.mockRejectedValue({
        code: "auth/invalid-user-token",
        codePrefix: "auth",
        errorInfo: {
          code: "auth/invalid-user-token",
          message: "Invalid user token",
        },
      });

      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
        })
        .expect(401);

      expect(body.message).toEqual("Invalid user token\nStack: update email");

      expect(userUpdateEmailMock).not.toHaveBeenCalled();
    });
    it("should fail for unknown error", async () => {
      //GIVEN
      authUpdateEmailMock.mockRejectedValue({});

      //WHEN
      await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
        })
        .expect(500);
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"newEmail" Required', '"previousEmail" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
          extra: "value",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
  });
  describe("update password", () => {
    const updatePasswordMock = vi.spyOn(AuthUtils, "updateUserPassword");

    beforeEach(() => {
      updatePasswordMock.mockClear().mockResolvedValue(null as never);
    });

    it("should update password", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/password")
        .set("Authorization", `Bearer ${uid}`)
        .send({ newPassword: "sw0rdf1sh" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Password updated",
        data: null,
      });
      expect(updatePasswordMock).toHaveBeenCalledWith(uid, "sw0rdf1sh");
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/password")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"newPassword" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/password")
        .set("Authorization", `Bearer ${uid}`)
        .send({ newPassword: "sw0rdf1sh", extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should fail with password too short", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/password")
        .set("Authorization", `Bearer ${uid}`)
        .send({ newPassword: "test" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"newPassword" String must contain at least 6 character(s)',
        ],
      });
    });
  });
  describe("add result filter preset", () => {
    const validPreset = {
      _id: "66c61b7a2a65715e66a0cc95",
      name: "newPreset",
      pb: { no: true, yes: true },
      difficulty: { normal: true, expert: false, master: false },
      mode: {
        words: false,
        time: false,
        quote: true,
        zen: false,
        custom: false,
      },
      words: {
        "10": false,
        "25": false,
        "50": false,
        "100": false,
        custom: false,
      },
      time: {
        "15": false,
        "30": false,
        "60": false,
        "120": false,
        custom: false,
      },
      quoteLength: {
        short: false,
        medium: false,
        long: false,
        thicc: false,
      },
      punctuation: {
        on: false,
        off: true,
      },
      numbers: {
        on: false,
        off: true,
      },
      date: {
        last_day: false,
        last_week: false,
        last_month: false,
        last_3months: false,
        all: true,
      },
      tags: {
        none: false,
      },
      language: {
        english: true,
      },
      funbox: {
        none: true,
      },
    };
    const generatedId = new ObjectId();

    const addResultFilterPresetMock = vi.spyOn(
      UserDal,
      "addResultFilterPreset",
    );

    beforeEach(async () => {
      addResultFilterPresetMock.mockClear().mockResolvedValue(generatedId);
      await enableResultFilterPresets(true);
    });
    it("should add", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .post("/users/resultFilterPresets")
        .set("Authorization", `Bearer ${uid}`)
        .send(validPreset)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Result filter preset created",
        data: generatedId.toHexString(),
      });

      expect(addResultFilterPresetMock).toHaveBeenCalledWith(
        uid,
        validPreset,
        (await Configuration.getLiveConfiguration()).results.filterPresets
          .maxPresetsPerUser,
      );
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/resultFilterPresets")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"_id" Required',
          '"name" Required',
          '"pb" Required',
          '"difficulty" Required',
          '"mode" Required',
          '"words" Required',
          '"time" Required',
          '"quoteLength" Required',
          '"punctuation" Required',
          '"numbers" Required',
          '"date" Required',
          '"tags" Required',
          '"language" Required',
          '"funbox" Required',
        ],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/resultFilterPresets")
        .set("Authorization", `Bearer ${uid}`)
        .send({ ...validPreset, extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should fail if feature is disabled", async () => {
      //GIVEN
      await enableResultFilterPresets(false);
      //WHEN
      const { body } = await mockApp
        .post("/users/resultFilterPresets")
        .set("Authorization", `Bearer ${uid}`)
        .send({ validPreset })
        .expect(503);

      //THEN
      expect(body.message).toEqual(
        "Result filter presets are not available at this time.",
      );
    });
  });
  describe("remove result filter preset", () => {
    const removeResultFilterPresetMock = vi.spyOn(
      UserDal,
      "removeResultFilterPreset",
    );

    beforeEach(async () => {
      await enableResultFilterPresets(true);
      removeResultFilterPresetMock.mockClear().mockResolvedValue();
    });

    it("should remove filter preset", async () => {
      //WHEN
      const { body } = await mockApp
        .delete("/users/resultFilterPresets/myId")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Result filter preset deleted",
        data: null,
      });
      expect(removeResultFilterPresetMock).toHaveBeenCalledWith(uid, "myId");
    });
    it("should fail if feature is disabled", async () => {
      //GIVEN
      await enableResultFilterPresets(false);

      //WHEN
      const { body } = await mockApp
        .delete("/users/resultFilterPresets/myId")
        .set("Authorization", `Bearer ${uid}`)
        .expect(503);

      //THEN
      expect(body.message).toEqual(
        "Result filter presets are not available at this time.",
      );
    });
  });
  describe("add tag", () => {
    const addTagMock = vi.spyOn(UserDal, "addTag");
    const newTag = {
      _id: new ObjectId(),
      name: "tagName",
      personalBests: {
        time: {},
        words: {},
        quote: {},
        zen: {},
        custom: {},
      },
    };

    beforeEach(() => {
      addTagMock.mockClear().mockResolvedValue(newTag);
    });

    it("should add tag", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .post("/users/tags")
        .send({ tagName: "tagName" })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Tag updated",
        data: { ...newTag, _id: newTag._id.toHexString() },
      });
      expect(addTagMock).toHaveBeenCalledWith(uid, "tagName");
    });
    it("should fail without mandatory properties", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .post("/users/tags")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"tagName" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .post("/users/tags")
        .set("Authorization", `Bearer ${uid}`)
        .send({ tagName: "tagName", extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
  });
  describe("clear tag pb", () => {
    const removeTagPbMock = vi.spyOn(UserDal, "removeTagPb");

    beforeEach(() => {
      removeTagPbMock.mockClear().mockResolvedValue();
    });

    it("should clear tag pb", async () => {
      //GIVEN
      const tagId = new ObjectId().toHexString();
      //WHEN
      const { body } = await mockApp
        .delete(`/users/tags/${tagId}/personalBest`)
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Tag PB cleared",
        data: null,
      });
      expect(removeTagPbMock).toHaveBeenLastCalledWith(uid, tagId);
    });
  });

  describe("update tag", () => {
    const editTagMock = vi.spyOn(UserDal, "editTag");
    beforeEach(() => {
      editTagMock.mockClear().mockResolvedValue();
    });

    it("should update tag", async () => {
      //GIVEN
      const tagId = new ObjectId().toHexString();

      //WHEN
      const { body } = await mockApp
        .patch(`/users/tags`)
        .set("Authorization", `Bearer ${uid}`)
        .send({ tagId, newName: "newName" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Tag updated",
        data: null,
      });
      expect(editTagMock).toHaveBeenCalledWith(uid, tagId, "newName");
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch(`/users/tags`)
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"tagId" Required', '"newName" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch(`/users/tags`)
        .set("Authorization", `Bearer ${uid}`)
        .send({
          tagId: new ObjectId().toHexString(),
          newName: "newName",
          extra: "value",
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
  });
  describe("remove tag", () => {
    const removeTagMock = vi.spyOn(UserDal, "removeTag");

    beforeEach(() => {
      removeTagMock.mockClear().mockResolvedValue();
    });

    it("should remove tag", async () => {
      //GIVEN
      const tagId = new ObjectId().toHexString();

      //WHEN
      const { body } = await mockApp
        .delete(`/users/tags/${tagId}`)
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Tag deleted",
        data: null,
      });

      expect(removeTagMock).toHaveBeenCalledWith(uid, tagId);
    });
  });
  describe("get tags", () => {
    const getTagsMock = vi.spyOn(UserDal, "getTags");

    beforeEach(() => {
      getTagsMock.mockClear();
    });

    it("should get tags", async () => {
      //GIVEN
      const tagOne: UserDal.DBUserTag = {
        _id: new ObjectId(),
        name: "tagOne",
        personalBests: {} as any,
      };
      const tagTwo: UserDal.DBUserTag = {
        _id: new ObjectId(),
        name: "tagOne",
        personalBests: {} as any,
      };

      getTagsMock.mockResolvedValue([tagOne, tagTwo]);

      //WHEN
      const { body } = await mockApp
        .get("/users/tags")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Tags retrieved",
        data: [
          { ...tagOne, _id: tagOne._id.toHexString() },
          { ...tagTwo, _id: tagTwo._id.toHexString() },
        ],
      });
      expect(getTagsMock).toHaveBeenCalledWith(uid);
    });
  });
  describe("get custom themes", () => {
    const getThemesMock = vi.spyOn(UserDal, "getThemes");
    beforeEach(() => {
      getThemesMock.mockClear();
    });
    it("should get custom themes", async () => {
      //GIVEN
      const themeOne: UserDal.DBCustomTheme = {
        _id: new ObjectId(),
        name: "themeOne",
        colors: new Array(10).fill("#000000") as any,
      };
      const themeTwo: UserDal.DBCustomTheme = {
        _id: new ObjectId(),
        name: "themeTwo",
        colors: new Array(10).fill("#FFFFFF") as any,
      };
      getThemesMock.mockResolvedValue([themeOne, themeTwo]);

      //WHEN
      const { body } = await mockApp
        .get("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Custom themes retrieved",
        data: [
          { ...themeOne, _id: themeOne._id.toHexString() },
          { ...themeTwo, _id: themeTwo._id.toHexString() },
        ],
      });
    });
  });
  describe("add custom theme", () => {
    const addThemeMock = vi.spyOn(UserDal, "addTheme");
    beforeEach(() => {
      addThemeMock.mockClear();
    });

    it("should add", async () => {
      //GIVEN
      const addedTheme: UserDal.DBCustomTheme = {
        _id: new ObjectId(),
        name: "custom",
        colors: new Array(10).fill("#000000") as any,
      };
      addThemeMock.mockResolvedValue(addedTheme);

      //WHEN
      const { body } = await mockApp
        .post("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          name: "customTheme",
          colors: new Array(10).fill("#000000") as any,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Custom theme added",
        data: { ...addedTheme, _id: addedTheme._id.toHexString() },
      });
      expect(addThemeMock).toHaveBeenCalledWith(uid, {
        name: "customTheme",
        colors: new Array(10).fill("#000000") as any,
      });
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"name" Required', '"colors" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          name: "customTheme",
          colors: new Array(10).fill("#000000") as any,
          extra: "value",
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should fail with invalid properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          name: "customThemecustomThemecustomThemecustomTheme",
          colors: new Array(9).fill("#000") as any,
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"name" String must contain at most 16 character(s)',
          '"colors" Array must contain at least 10 element(s)',
        ],
      });
    });
  });
  describe("remove custom theme", () => {
    const removeThemeMock = vi.spyOn(UserDal, "removeTheme");

    beforeEach(() => {
      removeThemeMock.mockClear().mockResolvedValue();
    });

    it("should remove theme", async () => {
      //GIVEN
      const themeId = new ObjectId().toHexString();

      //WHEN
      const { body } = await mockApp
        .delete("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({ themeId })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Custom theme removed",
        data: null,
      });
      expect(removeThemeMock).toHaveBeenCalledWith(uid, themeId);
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .delete("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"themeId" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .delete("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({ themeId: new ObjectId().toHexString(), extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
  });
  describe("edit custom theme", () => {
    const editThemeMock = vi.spyOn(UserDal, "editTheme");
    beforeEach(() => {
      editThemeMock.mockClear().mockResolvedValue();
    });

    it("should edit custom theme", async () => {
      //GIVEN
      const themeId = new ObjectId().toHexString();
      const theme = {
        name: "newName",
        colors: new Array(10).fill("#000000") as any,
      };

      //WHEN
      const { body } = await mockApp
        .patch("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          themeId,
          theme,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Custom theme updated",
        data: null,
      });
      expect(editThemeMock).toHaveBeenCalledWith(uid, themeId, theme);
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"themeId" Required', '"theme" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          themeId: new ObjectId().toHexString(),
          theme: {
            name: "newName",
            colors: new Array(10).fill("#000000") as any,
            extra2: "value",
          },
          extra: "value",
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          `"theme" Unrecognized key(s) in object: 'extra2'`,
          "Unrecognized key(s) in object: 'extra'",
        ],
      });
    });
  });
  describe("get personal bests", () => {
    const getPBMock = vi.spyOn(UserDal, "getPersonalBests");
    beforeEach(() => {
      getPBMock.mockClear();
    });

    it("should get pbs", async () => {
      //GIVEN
      const personalBest: PersonalBest = pb(15);
      getPBMock.mockResolvedValue(personalBest);

      //WHEN
      const { body } = await mockApp
        .get("/users/personalBests")
        .set("Authorization", `Bearer ${uid}`)
        .query({ mode: "time", mode2: "15" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Personal bests retrieved",
        data: personalBest,
      });
      expect(getPBMock).toHaveBeenCalledWith(uid, "time", "15");
    });
    it("should fail without mandatory query parameters", async () => {
      //WHEN
      const { body } = await mockApp
        .get("/users/personalBests")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"mode" Required'],
      });
    });
    it("should fail with unknown query parameters", async () => {
      //WHEN
      const { body } = await mockApp
        .get("/users/personalBests")
        .set("Authorization", `Bearer ${uid}`)
        .query({ mode: "time", mode2: "15", extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should fail with invalid query parameters", async () => {
      //WHEN
      const { body } = await mockApp
        .get("/users/personalBests")
        .set("Authorization", `Bearer ${uid}`)
        .query({ mode: "mood", mode2: "happy" })

        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          `"mode" Invalid enum value. Expected 'time' | 'words' | 'quote' | 'custom' | 'zen', received 'mood'`,
          `"mode2" Needs to be a number or a number represented as a string e.g. "10".`,
        ],
      });
    });
  });
  describe("get stats", () => {
    const getStatsMock = vi.spyOn(UserDal, "getStats");
    beforeEach(() => {
      getStatsMock.mockClear();
    });

    it("should get stats", async () => {
      //GIVEN
      const stats: Pick<
        UserDal.DBUser,
        "startedTests" | "completedTests" | "timeTyping"
      > = {
        startedTests: 5,
        completedTests: 3,
        timeTyping: 42,
      };
      getStatsMock.mockResolvedValue(stats);

      //WHEN
      const { body } = await mockApp
        .get("/users/stats")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Personal stats retrieved",
        data: stats,
      });

      expect(getStatsMock).toHaveBeenCalledWith(uid);
    });
  });
  describe("get favorite quotes", () => {
    const getFavoriteQuotesMock = vi.spyOn(UserDal, "getFavoriteQuotes");
    beforeEach(() => {
      getFavoriteQuotesMock.mockClear();
    });

    it("should get favorite quites", async () => {
      //GIVEN
      const favoriteQuotes = {
        english: ["1", "2"],
        german: ["1", "3"],
      };
      getFavoriteQuotesMock.mockResolvedValue(favoriteQuotes);

      //WHEN
      const { body } = await mockApp
        .get("/users/favoriteQuotes")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Favorite quotes retrieved",
        data: favoriteQuotes,
      });
      expect(getFavoriteQuotesMock).toHaveBeenCalledWith(uid);
    });
  });
  describe("add favorite quotes", () => {
    const addFavoriteQuoteMock = vi.spyOn(UserDal, "addFavoriteQuote");
    beforeEach(() => {
      addFavoriteQuoteMock.mockClear().mockResolvedValue();
    });
    it("should add", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/favoriteQuotes")
        .set("Authorization", `Bearer ${uid}`)
        .send({ language: "english", quoteId: "7" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Quote added to favorites",
        data: null,
      });
      expect(addFavoriteQuoteMock).toHaveBeenCalledWith(
        uid,
        "english",
        "7",
        (await Configuration.getLiveConfiguration()).quotes.maxFavorites,
      );
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/favoriteQuotes")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"language" Required', '"quoteId" Invalid input'],
      });
    });
    it("should fail unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/favoriteQuotes")
        .set("Authorization", `Bearer ${uid}`)
        .send({ language: "english", quoteId: "7", extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
  });
  describe("remove favorite quote", () => {
    const removeFavoriteQuoteMock = vi.spyOn(UserDal, "removeFavoriteQuote");
    beforeEach(() => {
      removeFavoriteQuoteMock.mockClear().mockResolvedValue();
    });

    it("should remove quote", async () => {
      //WHEN
      const { body } = await mockApp
        .delete("/users/favoriteQuotes")
        .set("Authorization", `Bearer ${uid}`)
        .send({ language: "english", quoteId: "7" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Quote removed from favorites",
        data: null,
      });
      expect(removeFavoriteQuoteMock).toHaveBeenCalledWith(uid, "english", "7");
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .delete("/users/favoriteQuotes")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"language" Required', '"quoteId" Invalid input'],
      });
    });
    it("should fail unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .delete("/users/favoriteQuotes")
        .set("Authorization", `Bearer ${uid}`)
        .send({ language: "english", quoteId: "7", extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
  });
  describe("get profile", () => {
    const getUserMock = vi.spyOn(UserDal, "getUser");
    const getUserByNameMock = vi.spyOn(UserDal, "getUserByName");
    const checkIfUserIsPremiumMock = vi.spyOn(UserDal, "checkIfUserIsPremium");

    const foundUser: Partial<UserDal.DBUser> = {
      _id: new ObjectId(),
      uid: new ObjectId().toHexString(),
      name: "bob",
      banned: false,
      inventory: { badges: [{ id: 1, selected: true }, { id: 2 }] },
      profileDetails: {
        bio: "bio",
        keyboard: "keyboard",
        socialProfiles: {
          twitter: "twitter",
          github: "github",
        },
      },
      personalBests: {
        time: {
          "15": [pb(15), pb(16)],
          "30": [pb(30), pb(31)],
          "60": [pb(60), pb(61)],
          "120": [pb(120), pb(121)],
          "42": [pb(42), pb(43)],
        },
        words: {
          "10": [pb(10), pb(11)],
          "25": [pb(25), pb(26)],
          "50": [pb(50), pb(51)],
          "100": [pb(100), pb(101)],
          "42": [pb(42), pb(43)],
        },
        custom: {},
        zen: {},
        quote: {},
      },
      completedTests: 23,
      startedTests: 42,
      timeTyping: 234,
      addedAt: 1000,
      xp: 10,
      streak: { length: 2, lastResultTimestamp: 2000, maxLength: 5 },
      bananas: 47, //should get removed
      testActivity: {
        "2024": fillYearWithDay(94),
      },
    };

    beforeEach(async () => {
      getUserMock.mockClear();
      getUserByNameMock.mockClear();
      checkIfUserIsPremiumMock.mockClear().mockResolvedValue(true);
      await enableProfiles(true);
    });

    it("should get by name without authentication", async () => {
      //GIVEN

      getUserByNameMock.mockResolvedValue(foundUser as any);

      //WHEN
      const { body } = await mockApp.get("/users/bob/profile").expect(200);

      //THEN
      expect(body).toEqual({
        message: "Profile retrieved",
        data: {
          uid: foundUser.uid,
          name: "bob",
          banned: false,
          addedAt: 1000,
          typingStats: {
            completedTests: 23,
            startedTests: 42,
            timeTyping: 234,
          },
          personalBests: {
            time: {
              "15": foundUser.personalBests?.time["15"],
              "30": foundUser.personalBests?.time["30"],
              "60": foundUser.personalBests?.time["60"],
              "120": foundUser.personalBests?.time["120"],
            },
            words: {
              "10": foundUser.personalBests?.words["10"],
              "25": foundUser.personalBests?.words["25"],
              "50": foundUser.personalBests?.words["50"],
              "100": foundUser.personalBests?.words["100"],
            },
          },

          xp: 10,
          streak: 2,
          maxStreak: 5,
          isPremium: true,
          inventory: foundUser.inventory,
          details: foundUser.profileDetails,
        },
      });
      expect(getUserByNameMock).toHaveBeenCalledWith("bob", "get user profile");
      expect(getUserMock).not.toHaveBeenCalled();
    });
    it("should get testActivity if enabled", async () => {
      //GIVEN
      vi.useFakeTimers().setSystemTime(1712102400000);
      getUserByNameMock.mockResolvedValue({
        ...foundUser,
        profileDetails: { showActivityOnPublicProfile: true },
      } as any);
      //WHEN
      const { body } = await mockApp.get("/users/bob/profile").expect(200);

      //THEN
      expect(body.data.testActivity).toEqual(
        expect.objectContaining({
          lastDay: 1712102400000,
          testsByDays: expect.arrayContaining([]),
        }),
      );
    });
    it("should not get testActivity if disabled", async () => {
      //GIVEN
      vi.useFakeTimers().setSystemTime(1712102400000);
      getUserByNameMock.mockResolvedValue({
        ...foundUser,
        profileDetails: { showActivityOnPublicProfile: false },
      } as any);
      //WHEN
      const { body } = await mockApp.get("/users/bob/profile").expect(200);

      //THEN
      expect(body.data.testActivity).toBeUndefined();
    });

    it("should get base profile for banned user", async () => {
      //GIVEN
      getUserByNameMock.mockResolvedValue({
        ...foundUser,
        banned: true,
      } as any);

      //WHEN
      const { body } = await mockApp.get("/users/bob/profile").expect(200);

      //THEN
      expect(body).toEqual({
        message: "Profile retrived: banned user",
        data: {
          name: "bob",
          banned: true,
          addedAt: 1000,
          typingStats: {
            completedTests: 23,
            startedTests: 42,
            timeTyping: 234,
          },
          personalBests: {
            time: {
              "15": foundUser.personalBests?.time["15"],
              "30": foundUser.personalBests?.time["30"],
              "60": foundUser.personalBests?.time["60"],
              "120": foundUser.personalBests?.time["120"],
            },
            words: {
              "10": foundUser.personalBests?.words["10"],
              "25": foundUser.personalBests?.words["25"],
              "50": foundUser.personalBests?.words["50"],
              "100": foundUser.personalBests?.words["100"],
            },
          },

          xp: 10,
          streak: 2,
          maxStreak: 5,
          isPremium: true,
        },
      });
      expect(getUserByNameMock).toHaveBeenCalledWith("bob", "get user profile");
      expect(getUserMock).not.toHaveBeenCalled();
    });
    it("should get by uid without authentication", async () => {
      //GIVEN
      const uid = foundUser.uid;
      getUserMock.mockResolvedValue(foundUser as any);

      //WHEN
      const { body } = await mockApp
        .get(`/users/${uid}/profile`)
        .query({ isUid: "" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Profile retrieved",
        data: expect.objectContaining({
          uid: foundUser.uid,
        }),
      });
      expect(getUserByNameMock).not.toHaveBeenCalled();
      expect(getUserMock).toHaveBeenCalledWith(uid, "get user profile");
    });
    it("should fail if feature is disabled", async () => {
      //GIVEN
      await enableProfiles(false);

      //WHEN
      const { body } = await mockApp.get(`/users/bob/profile`).expect(503);

      //THEN
      expect(body.message).toEqual("Profiles are not available at this time");
    });
  });
  describe("update profile", () => {
    const getPartialUserMock = vi.spyOn(UserDal, "getPartialUser");
    const updateProfileMock = vi.spyOn(UserDal, "updateProfile");

    beforeEach(async () => {
      getPartialUserMock.mockClear().mockResolvedValue({
        inventory: {
          badges: [{ id: 4, selected: true }, { id: 2 }, { id: 3 }],
        },
      } as any);
      updateProfileMock.mockClear().mockResolvedValue();
      await enableProfiles(true);
    });

    it("should update", async () => {
      //GIVEN
      const newProfile = {
        bio: "newBio",
        keyboard: "newKeyboard",

        socialProfiles: {
          github: "github",
          twitter: "twitter",
          website: "https://monkeytype.com",
        },
        showActivityOnPublicProfile: false,
      };

      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          ...newProfile,
          selectedBadgeId: 2,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Profile updated",
        data: newProfile,
      });
      expect(updateProfileMock).toHaveBeenCalledWith(
        uid,
        {
          bio: "newBio",
          keyboard: "newKeyboard",
          socialProfiles: {
            github: "github",
            twitter: "twitter",
            website: "https://monkeytype.com",
          },
          showActivityOnPublicProfile: false,
        },
        {
          badges: [{ id: 4 }, { id: 2, selected: true }, { id: 3 }],
        },
      );
    });
    it("should update with empty strings", async () => {
      //GIVEN
      const newProfile = {
        bio: "",
        keyboard: "",

        socialProfiles: {
          github: "",
          twitter: "",
          website: "",
        },
      };

      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          ...newProfile,
          selectedBadgeId: -1,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Profile updated",
        data: newProfile,
      });
      expect(updateProfileMock).toHaveBeenCalledWith(
        uid,
        {
          bio: "",
          keyboard: "",
          socialProfiles: {
            github: "",
            twitter: "",
            website: "",
          },
        },
        {
          badges: [{ id: 4 }, { id: 2 }, { id: 3 }],
        },
      );
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          extra: "value",
          socialProfiles: {
            extra2: "value",
          },
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          `"socialProfiles" Unrecognized key(s) in object: 'extra2'`,
          "Unrecognized key(s) in object: 'extra'",
        ],
      });
    });
    it("should sanitize inputs", async () => {
      //WHEN
      await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          bio: "Line1\n\n\nLine2\n\n\n\nLine3",
          keyboard: "  string     with      many      spaces      ",
        })
        .expect(200);

      //THEN
      expect(updateProfileMock).toHaveBeenCalledWith(
        uid,
        {
          bio: "Line1\n\nLine2\n\nLine3",
          keyboard: "string  with  many  spaces",
          socialProfiles: {},
        },
        expect.objectContaining({}),
      );
    });
    it("should fail with disallowed word", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          bio: "miodec",
          keyboard: "miodec",
          socialProfiles: {
            twitter: "miodec",
            github: "miodec",
            website: "https://i-luv-miodec.com",
          },
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"bio" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (miodec).',
          '"keyboard" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (miodec).',
          '"socialProfiles.twitter" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (miodec).',
          '"socialProfiles.github" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (miodec).',
          '"socialProfiles.website" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (https://i-luv-miodec.com).',
        ],
      });
    });
    it("should fail with properties exceeding max lengths", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          bio: new Array(251).fill("x").join(""),
          keyboard: new Array(76).fill("x").join(""),
          socialProfiles: {
            twitter: new Array(16).fill("x").join(""),
            github: new Array(40).fill("x").join(""),
            website: `https://${new Array(201 - "https://".length)
              .fill("x")
              .join("")}`,
          },
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"bio" String must contain at most 250 character(s)',
          '"keyboard" String must contain at most 75 character(s)',
          '"socialProfiles.twitter" String must contain at most 15 character(s)',
          '"socialProfiles.github" String must contain at most 39 character(s)',
          '"socialProfiles.website" String must contain at most 200 character(s)',
        ],
      });
    });
    it("should fail with website not using https", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          socialProfiles: {
            website: "http://monkeytype.com",
          },
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"socialProfiles.website" Invalid input: must start with "https://"',
        ],
      });
    });
    it("should fail if feature is disabled", async () => {
      //GIVEN
      await enableProfiles(false);

      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({})
        .expect(503);

      //THEN
      expect(body.message).toEqual("Profiles are not available at this time");
    });
  });
  describe("set streak hour offset", () => {
    const getPartialUserMock = vi.spyOn(UserDal, "getPartialUser");
    const setStreakHourOffsetMock = vi.spyOn(UserDal, "setStreakHourOffset");

    beforeEach(() => {
      getPartialUserMock.mockClear().mockResolvedValue({} as any);
      setStreakHourOffsetMock.mockClear().mockResolvedValue();
    });

    it("should set", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/setStreakHourOffset")
        .set("Authorization", `Bearer ${uid}`)
        .send({ hourOffset: -2 })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Streak hour offset set",
        data: null,
      });

      expect(setStreakHourOffsetMock).toHaveBeenCalledWith(uid, -2);
    });
    it("should fail if offset already set", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({
        streak: { hourOffset: -2 },
      } as any);

      //WHEN
      const { body } = await mockApp
        .post("/users/setStreakHourOffset")
        .set("Authorization", `Bearer ${uid}`)
        .send({ hourOffset: -2 })
        .expect(403);

      //THEN
      expect(body.message).toEqual("Streak hour offset already set");
      expect(setStreakHourOffsetMock).not.toHaveBeenCalled();
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/setStreakHourOffset")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"hourOffset" Required'],
      });
    });
    it("should fail with invalid offset", async () => {
      await mockApp
        .post("/users/setStreakHourOffset")
        .set("Authorization", `Bearer ${uid}`)
        .send({ hourOffset: -12 })
        .expect(422);

      await mockApp
        .post("/users/setStreakHourOffset")
        .set("Authorization", `Bearer ${uid}`)
        .send({ hourOffset: 13 })
        .expect(422);

      await mockApp
        .post("/users/setStreakHourOffset")
        .set("Authorization", `Bearer ${uid}`)
        .send({ hourOffset: "UTC-8" })
        .expect(422);
    });
  });
  describe("revoke all token", () => {
    const removeTokensByUidMock = vi.spyOn(AuthUtils, "revokeTokensByUid");

    beforeEach(() => {
      removeTokensByUidMock.mockClear().mockResolvedValue();
    });
    it("should revoke all tokens", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/revokeAllTokens")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "All tokens revoked",
        data: null,
      });
      expect(removeTokensByUidMock).toHaveBeenCalledWith(uid);
    });
  });
  describe("getCurrentTestActivity", () => {
    const getUserMock = vi.spyOn(UserDal, "getPartialUser");

    afterEach(() => {
      getUserMock.mockClear();
    });
    it("gets", async () => {
      //GIVEN
      vi.useFakeTimers().setSystemTime(1712102400000);
      const user = {
        uid: uid,
        testActivity: {
          "2024": fillYearWithDay(94),
        },
      } as Partial<UserDal.DBUser> as UserDal.DBUser;
      getUserMock.mockResolvedValue(user);

      //WHEN
      const result = await mockApp
        .get("/users/currentTestActivity")
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //THEN
      expect(result.body.data.lastDay).toEqual(1712102400000);
      const testsByDays = result.body.data.testsByDays;
      expect(testsByDays).toHaveLength(372);
      expect(testsByDays[6]).toEqual(null); //2023-04-04
      expect(testsByDays[277]).toEqual(null); //2023-12-31
      expect(testsByDays[278]).toEqual(1); //2024-01-01
      expect(testsByDays[371]).toEqual(94); //2024-01
    });
  });
  describe("getStreak", () => {
    const getUserMock = vi.spyOn(UserDal, "getPartialUser");

    afterEach(() => {
      getUserMock.mockClear();
    });
    it("gets", async () => {
      //GIVEN
      const user = {
        uid: uid,
        streak: {
          lastResultTimestamp: 1712102400000,
          length: 42,
          maxLength: 1024,
          hourOffset: 2,
        },
      } as Partial<UserDal.DBUser> as UserDal.DBUser;
      getUserMock.mockResolvedValue(user);

      //WHEN
      const result = await mockApp
        .get("/users/streak")
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //THEN
      const streak: UserStreak = result.body.data;
      expect(streak).toEqual({
        lastResultTimestamp: 1712102400000,
        length: 42,
        maxLength: 1024,
        hourOffset: 2,
      });
    });
  });
});

function fillYearWithDay(days: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < days; i++) {
    result.push(i + 1);
  }
  return result;
}

async function enablePremiumFeatures(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.users.premium = { ...mockConfig.users.premium, enabled };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}

async function enableSignup(signUp: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.users = { ...mockConfig.users, signUp };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}

async function enableResultFilterPresets(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.results.filterPresets = {
    ...mockConfig.results.filterPresets,
    enabled,
  };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}

async function enableProfiles(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.users.profiles = { ...mockConfig.users.profiles, enabled };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}
