import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import * as PresetDal from "../../../src/dal/preset";
import * as UserTestData from "../../__testData__/users";

async function givenUid(): Promise<string> {
  //presets reference users, so the user has to exist first
  return (await UserTestData.createUser()).uid;
}

describe("PresetDal", () => {
  describe("readPreset", () => {
    it("should read", async () => {
      //GIVEN
      const uid = await givenUid();
      const decoyUid = await givenUid();
      const first = await PresetDal.addPreset(uid, {
        name: "first",
        config: { punctuation: true },
      });
      const second = await PresetDal.addPreset(uid, {
        name: "second",
        settingGroups: ["hideElements"],
        config: {
          showKeyTips: true,
          capsLockWarning: true,
          showOutOfFocusWarning: true,
          showAverage: "off",
        },
      });

      await PresetDal.addPreset(decoyUid, {
        name: "unknown",
        config: {},
      });

      //WHEN
      const read = await PresetDal.getPresets(uid);

      //THEN
      expect(read).toHaveLength(2);
      expect(read).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: first.presetId,
            uid: uid,
            name: "first",
            config: { punctuation: true },
          }),
          expect.objectContaining({
            _id: second.presetId,
            uid: uid,
            name: "second",
            settingGroups: ["hideElements"],
            config: {
              showKeyTips: true,
              capsLockWarning: true,
              showOutOfFocusWarning: true,
              showAverage: "off",
            },
          }),
        ]),
      );
    });
  });

  describe("addPreset", () => {
    it("should return error if maximum is reached", async () => {
      //GIVEN
      const uid = await givenUid();
      for (let i = 0; i < 10; i++) {
        await PresetDal.addPreset(uid, { name: "test", config: {} });
      }

      //WHEN / THEN
      await expect(async () =>
        PresetDal.addPreset(uid, { name: "max", config: {} }),
      ).rejects.toThrow("Too many presets");
    });
    it("should add preset", async () => {
      //GIVEN
      const uid = await givenUid();
      for (let i = 0; i < 9; i++) {
        await PresetDal.addPreset(uid, { name: "test", config: {} });
      }

      //WHEN
      const newPreset = await PresetDal.addPreset(uid, {
        name: "new",
        config: {
          punctuation: true,
        },
      });

      //THEN
      const read = await PresetDal.getPresets(uid);

      expect(read).toHaveLength(10);
      expect(read).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: newPreset.presetId,
            uid: uid,
            name: "new",
            config: { punctuation: true },
          }),
        ]),
      );
    });
  });

  describe("editPreset", () => {
    it("should not fail if preset is unknown", async () => {
      const uid = await givenUid();
      await PresetDal.editPreset(uid, {
        _id: randomUUID(),
        name: "new",
        config: {},
      });
    });

    it("should edit", async () => {
      //GIVEN
      const uid = await givenUid();
      const decoyUid = await givenUid();
      const first = (
        await PresetDal.addPreset(uid, {
          name: "first",
          config: { punctuation: true },
        })
      ).presetId;
      const second = (
        await PresetDal.addPreset(uid, {
          name: "second",
          config: {
            numbers: true,
          },
        })
      ).presetId;
      const decoy = (
        await PresetDal.addPreset(decoyUid, {
          name: "unknown",
          config: { numbers: true },
        })
      ).presetId;

      //WHEN
      await PresetDal.editPreset(uid, {
        _id: first,
        name: "newName",
        config: { punctuation: false },
      });

      //THEN
      const read = await PresetDal.getPresets(uid);
      expect(read).toHaveLength(2);
      expect(read).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: first,
            uid: uid,
            name: "newName",
            config: { punctuation: false },
          }),
          expect.objectContaining({
            _id: second,
            uid: uid,
            name: "second",
            config: { numbers: true },
          }),
        ]),
      );
      expect(await PresetDal.getPresets(decoyUid)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: decoy,
            uid: decoyUid,
            name: "unknown",
            config: { numbers: true },
          }),
        ]),
      );
    });

    it("should edit with name only - full preset", async () => {
      //GIVEN
      const uid = await givenUid();
      const first = (
        await PresetDal.addPreset(uid, {
          name: "first",
          config: { punctuation: true },
        })
      ).presetId;

      //WHEN empty
      await PresetDal.editPreset(uid, {
        _id: first,
        name: "newName",
      });
      expect(await PresetDal.getPresets(uid)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: first,
            uid: uid,
            name: "newName",
            config: { punctuation: true },
          }),
        ]),
      );
    });
    it("should edit with name only - partial preset", async () => {
      //GIVEN
      const uid = await givenUid();
      const first = (
        await PresetDal.addPreset(uid, {
          name: "first",
          settingGroups: ["hideElements"],
          config: {
            showKeyTips: true,
            capsLockWarning: true,
            showOutOfFocusWarning: true,
            showAverage: "off",
          },
        })
      ).presetId;

      //WHEN empty
      await PresetDal.editPreset(uid, {
        _id: first,
        name: "newName",
      });
      expect(await PresetDal.getPresets(uid)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: first,
            uid: uid,
            name: "newName",
            settingGroups: ["hideElements"],
            config: {
              showKeyTips: true,
              capsLockWarning: true,
              showOutOfFocusWarning: true,
              showAverage: "off",
            },
          }),
        ]),
      );
    });
    it("should not edit present not matching uid", async () => {
      //GIVEN
      const uid = await givenUid();
      const decoyUid = await givenUid();
      const first = (
        await PresetDal.addPreset(uid, {
          name: "first",
          config: { punctuation: true },
        })
      ).presetId;

      //WHEN
      await PresetDal.editPreset(decoyUid, {
        _id: first,
        name: "newName",
        config: { punctuation: false },
      });

      //THEN
      const read = await PresetDal.getPresets(uid);

      expect(read).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: first,
            uid: uid,
            name: "first",
            config: { punctuation: true },
          }),
        ]),
      );
    });
    it("should edit when partial is edited to full", async () => {
      //GIVEN
      const uid = await givenUid();
      const first = (
        await PresetDal.addPreset(uid, {
          name: "first",
          settingGroups: ["hideElements"],
          config: {
            showKeyTips: true,
            capsLockWarning: true,
            showOutOfFocusWarning: true,
            showAverage: "off",
          },
        })
      ).presetId;
      //WHEN
      await PresetDal.editPreset(uid, {
        _id: first,
        name: "newName",
        settingGroups: null,
        config: { punctuation: false },
      });

      //THEN
      expect(await PresetDal.getPresets(uid)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: first,
            uid: uid,
            name: "newName",
            config: { punctuation: false },
            settingGroups: null,
          }),
        ]),
      );
    });
    it("should edit when full is edited to partial", async () => {
      //GIVEN
      const uid = await givenUid();
      const first = (
        await PresetDal.addPreset(uid, {
          name: "first",
          config: {
            punctuation: false,
          },
        })
      ).presetId;

      //WHEN
      await PresetDal.editPreset(uid, {
        _id: first,
        name: "newName",
        settingGroups: ["hideElements"],
        config: {
          showKeyTips: true,
          capsLockWarning: true,
          showOutOfFocusWarning: true,
          showAverage: "off",
        },
      });

      //THEN
      expect(await PresetDal.getPresets(uid)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: first,
            uid: uid,
            name: "newName",
            settingGroups: ["hideElements"],
            config: {
              showKeyTips: true,
              capsLockWarning: true,
              showOutOfFocusWarning: true,
              showAverage: "off",
            },
          }),
        ]),
      );
    });
  });

  describe("removePreset", () => {
    it("should fail if preset is unknown", async () => {
      const uid = await givenUid();
      await expect(async () =>
        PresetDal.removePreset(uid, randomUUID()),
      ).rejects.toThrow("Preset not found");
    });
    it("should remove", async () => {
      //GIVEN
      const uid = await givenUid();
      const decoyUid = await givenUid();
      const first = (
        await PresetDal.addPreset(uid, { name: "first", config: {} })
      ).presetId;
      const second = (
        await PresetDal.addPreset(uid, {
          name: "second",
          config: { numbers: true },
        })
      ).presetId;
      const decoy = (
        await PresetDal.addPreset(decoyUid, {
          name: "unknown",
          config: { numbers: true },
        })
      ).presetId;

      //WHEN
      await PresetDal.removePreset(uid, first);

      //THEN
      const read = await PresetDal.getPresets(uid);
      expect(read).toHaveLength(1);
      expect(read).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: second,
            uid: uid,
            name: "second",
            config: { numbers: true },
          }),
        ]),
      );
      expect(await PresetDal.getPresets(decoyUid)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: decoy,
            uid: decoyUid,
            name: "unknown",
            config: { numbers: true },
          }),
        ]),
      );
    });
    it("should not remove present not matching uid", async () => {
      //GIVEN
      const uid = await givenUid();
      const decoyUid = await givenUid();
      const first = (
        await PresetDal.addPreset(uid, {
          name: "first",
          config: { punctuation: true },
        })
      ).presetId;

      //WHEN
      await expect(async () =>
        PresetDal.removePreset(decoyUid, first),
      ).rejects.toThrow("Preset not found");

      //THEN
      const read = await PresetDal.getPresets(uid);

      expect(read).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: first,
            uid: uid,
            name: "first",
            config: { punctuation: true },
          }),
        ]),
      );
    });
  });

  describe("deleteAllPresets", () => {
    it("should not fail if preset is unknown", async () => {
      const uid = await givenUid();
      await PresetDal.deleteAllPresets(uid);
    });
    it("should delete all", async () => {
      //GIVEN
      const uid = await givenUid();
      const decoyUid = await givenUid();
      await PresetDal.addPreset(uid, { name: "first", config: {} });
      await PresetDal.addPreset(uid, {
        name: "second",
        config: { numbers: true },
      });
      const decoy = (
        await PresetDal.addPreset(decoyUid, {
          name: "unknown",
          config: { numbers: true },
        })
      ).presetId;

      //WHEN
      await PresetDal.deleteAllPresets(uid);

      //THEN
      const read = await PresetDal.getPresets(uid);
      expect(read).toHaveLength(0);

      expect(await PresetDal.getPresets(decoyUid)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            _id: decoy,
            uid: decoyUid,
            name: "unknown",
            config: { numbers: true },
          }),
        ]),
      );
    });
  });
});
