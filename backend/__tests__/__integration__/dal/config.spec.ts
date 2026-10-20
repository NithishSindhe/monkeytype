import { describe, expect, it } from "vitest";
import * as ConfigDal from "../../../src/dal/config";
import * as UserTestData from "../../__testData__/users";

async function givenUid(): Promise<string> {
  //configs reference users, so the user has to exist first
  return (await UserTestData.createUser()).uid;
}

describe("ConfigDal", () => {
  describe("saveConfig", () => {
    it("should insert the config when the user has none", async () => {
      //GIVEN
      const uid = await givenUid();

      //WHEN
      await ConfigDal.saveConfig(uid, { punctuation: true, time: 60 });

      //THEN
      const saved = await ConfigDal.getConfig(uid);
      expect(saved).toEqual({ uid, config: { punctuation: true, time: 60 } });
    });

    it("should merge into the existing config instead of replacing it", async () => {
      //GIVEN
      const uid = await givenUid();
      await ConfigDal.saveConfig(uid, { punctuation: true, time: 60 });

      //WHEN
      await ConfigDal.saveConfig(uid, {
        punctuation: false,
        difficulty: "normal",
      });

      //THEN
      const saved = await ConfigDal.getConfig(uid);
      expect(saved?.config).toEqual({
        punctuation: false,
        time: 60,
        difficulty: "normal",
      });
    });

    it("should keep the configs of other users untouched", async () => {
      //GIVEN
      const uid = await givenUid();
      const decoyUid = await givenUid();
      await ConfigDal.saveConfig(decoyUid, { punctuation: true });

      //WHEN
      await ConfigDal.saveConfig(uid, { punctuation: false });

      //THEN
      expect((await ConfigDal.getConfig(decoyUid))?.config).toEqual({
        punctuation: true,
      });
    });
  });

  describe("getConfig", () => {
    it("should return null for a user without a config", async () => {
      //GIVEN
      const uid = await givenUid();

      //WHEN / THEN
      expect(await ConfigDal.getConfig(uid)).toBeNull();
    });

    it("should return null for an unknown user", async () => {
      expect(await ConfigDal.getConfig("non existing uid")).toBeNull();
    });
  });

  describe("deleteConfig", () => {
    it("should delete the config of the user", async () => {
      //GIVEN
      const uid = await givenUid();
      const decoyUid = await givenUid();
      await ConfigDal.saveConfig(uid, { punctuation: true });
      await ConfigDal.saveConfig(decoyUid, { punctuation: true });

      //WHEN
      await ConfigDal.deleteConfig(uid);

      //THEN
      expect(await ConfigDal.getConfig(uid)).toBeNull();
      expect(await ConfigDal.getConfig(decoyUid)).not.toBeNull();
    });

    it("should not fail if the user has no config", async () => {
      //GIVEN
      const uid = await givenUid();

      //WHEN / THEN
      await expect(ConfigDal.deleteConfig(uid)).resolves.toBeUndefined();
    });
  });
});
