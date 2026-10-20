import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import * as ResultDal from "../../../src/dal/result";
import * as UserDal from "../../../src/dal/user";
import * as UserTestData from "../../__testData__/users";
import { DBResult } from "../../../src/utils/result";

let uid: string;
const timestamp = Date.now() - 60000;

function givenResult(modify?: Partial<DBResult>): DBResult {
  return {
    _id: "",
    wpm: 1,
    rawWpm: 2,
    charStats: [1, 2, 3, 4],
    acc: 90,
    mode: "time",
    mode2: "10",
    quoteLength: 1,
    timestamp,
    restartCount: 0,
    incompleteTestSeconds: 0,
    testDuration: 10,
    afkDuration: 0,
    tags: [],
    consistency: 100,
    keyConsistency: 100,
    chartData: { wpm: [1], burst: [2], err: [0] },
    uid,
    keySpacingStats: { average: 0, sd: 0 },
    keyDurationStats: { average: 0, sd: 0 },
    difficulty: "normal",
    language: "english",
    isPb: false,
    name: "Test",
    funbox: ["58008", "read_ahead"],
    ...modify,
  };
}

async function createDummyData(
  uid: string,
  count: number,
  modify?: Partial<DBResult>,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await ResultDal.addResult(
      uid,
      givenResult({ wpm: i, rawWpm: i, ...modify }),
    );
  }
}

describe("ResultDal", () => {
  beforeEach(async () => {
    //results reference users, so the user has to exist first
    uid = (await UserTestData.createUser()).uid;
  });

  describe("addResult", () => {
    it("should return the generated uuid", async () => {
      //WHEN
      const { insertedId } = await ResultDal.addResult(uid, givenResult());

      //THEN
      expect(insertedId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("should generate a different id for every result", async () => {
      //WHEN
      const first = await ResultDal.addResult(uid, givenResult());
      const second = await ResultDal.addResult(uid, givenResult());

      //THEN
      expect(first.insertedId).not.toEqual(second.insertedId);
    });

    it("should fail for an unknown user", async () => {
      await expect(
        ResultDal.addResult("non existing uid", givenResult()),
      ).rejects.toThrow("User not found");
    });
  });

  describe("getResult", () => {
    it("should read the result back unchanged", async () => {
      //GIVEN
      const { insertedId } = await ResultDal.addResult(
        uid,
        givenResult({ tags: ["one"] }),
      );

      //WHEN
      const read = await ResultDal.getResult(uid, insertedId);

      //THEN
      expect(read).toEqual({
        _id: insertedId,
        uid,
        wpm: 1,
        rawWpm: 2,
        charStats: [1, 2, 3, 4],
        acc: 90,
        mode: "time",
        mode2: "10",
        quoteLength: 1,
        timestamp,
        testDuration: 10,
        tags: ["one"],
        consistency: 100,
        keyConsistency: 100,
        chartData: { wpm: [1], burst: [2], err: [0] },
        keySpacingStats: { average: 0, sd: 0 },
        keyDurationStats: { average: 0, sd: 0 },
        difficulty: "normal",
        language: "english",
        isPb: false,
        name: "Test",
        funbox: ["58008", "read_ahead"],
        restartCount: 0,
        incompleteTestSeconds: 0,
        afkDuration: 0,
      });
    });

    it("should return the timestamp as a number", async () => {
      //the column is a bigint, which the driver hands back as a string
      //GIVEN
      const { insertedId } = await ResultDal.addResult(uid, givenResult());

      //WHEN
      const read = await ResultDal.getResult(uid, insertedId);

      //THEN
      expect(typeof read.timestamp).toBe("number");
      expect(read.timestamp).toEqual(timestamp);
    });

    it("should omit the values that were not set", async () => {
      //GIVEN
      const { insertedId } = await ResultDal.addResult(
        uid,
        givenResult({
          bailedOut: undefined,
          blindMode: undefined,
          lazyMode: undefined,
          numbers: undefined,
          punctuation: undefined,
        }),
      );

      //WHEN
      const read = await ResultDal.getResult(uid, insertedId);

      //THEN
      for (const key of [
        "bailedOut",
        "blindMode",
        "lazyMode",
        "numbers",
        "punctuation",
      ]) {
        expect(read).not.toHaveProperty(key);
      }
    });

    it("should fail for a result of another user", async () => {
      //GIVEN
      const { insertedId } = await ResultDal.addResult(uid, givenResult());
      const otherUid = (await UserTestData.createUser()).uid;

      //WHEN / THEN
      await expect(ResultDal.getResult(otherUid, insertedId)).rejects.toThrow(
        "Result not found",
      );
    });

    it("should fail for an unknown result", async () => {
      await expect(ResultDal.getResult(uid, randomUUID())).rejects.toThrow(
        "Result not found",
      );
    });

    it("should fail for an id that is not a uuid", async () => {
      //ids are uuids now, anything else must not reach the database
      await expect(ResultDal.getResult(uid, "not-a-uuid")).rejects.toThrow(
        "Result not found",
      );
    });
  });

  describe("getResults", () => {
    it("should read lastest 10 results ordered by timestamp", async () => {
      //GIVEN
      await createDummyData(uid, 10, { timestamp: timestamp - 2000 });
      await createDummyData(uid, 20, { tags: ["current"] });

      //WHEN
      const results = await ResultDal.getResults(uid, { limit: 10 });

      //THEN
      expect(results).toHaveLength(10);
      let last = results[0]?.timestamp as number;
      results.forEach((it) => {
        expect(it.tags).toContain("current");
        expect(it.timestamp).toBeLessThanOrEqual(last);
        last = it.timestamp;
      });
    });
    it("should read all if not limited", async () => {
      //GIVEN
      await createDummyData(uid, 10, { timestamp: timestamp - 2000 });
      await createDummyData(uid, 20);

      //WHEN
      const results = await ResultDal.getResults(uid, {});

      //THEN
      expect(results).toHaveLength(30);
    });
    it("should read results onOrAfterTimestamp", async () => {
      //GIVEN
      await createDummyData(uid, 10, { timestamp: timestamp - 2000 });
      await createDummyData(uid, 20, { tags: ["current"] });

      //WHEN
      const results = await ResultDal.getResults(uid, {
        onOrAfterTimestamp: timestamp,
      });

      //THEN
      expect(results).toHaveLength(20);
      results.forEach((it) => {
        expect(it.tags).toContain("current");
      });
    });
    it("should read next 10 results", async () => {
      //GIVEN
      await createDummyData(uid, 10, {
        timestamp: timestamp - 2000,
        tags: ["old"],
      });
      await createDummyData(uid, 20);

      //WHEN
      const results = await ResultDal.getResults(uid, {
        limit: 10,
        offset: 20,
      });

      //THEN
      expect(results).toHaveLength(10);
      results.forEach((it) => {
        expect(it.tags).toContain("old");
      });
    });
    it("should leave out the heavy per-key data", async () => {
      //GIVEN
      await createDummyData(uid, 1);

      //WHEN
      const [result] = await ResultDal.getResults(uid);

      //THEN
      expect(result).not.toHaveProperty("chartData");
      expect(result).not.toHaveProperty("keySpacingStats");
      expect(result).not.toHaveProperty("keyDurationStats");
      expect(result).not.toHaveProperty("name");
    });
    it("should not read the results of other users", async () => {
      //GIVEN
      await createDummyData(uid, 3);
      const otherUid = (await UserTestData.createUser()).uid;
      await createDummyData(otherUid, 2);

      //WHEN / THEN
      expect(await ResultDal.getResults(uid)).toHaveLength(3);
      expect(await ResultDal.getResults(otherUid)).toHaveLength(2);
    });
  });

  describe("getLastResult", () => {
    it("should read the newest result", async () => {
      //GIVEN
      await ResultDal.addResult(
        uid,
        givenResult({ timestamp: timestamp - 2000, wpm: 10 }),
      );
      const { insertedId } = await ResultDal.addResult(
        uid,
        givenResult({ timestamp, wpm: 20 }),
      );

      //WHEN
      const read = await ResultDal.getLastResult(uid);

      //THEN
      expect(read._id).toEqual(insertedId);
      expect(read.wpm).toEqual(20);
    });

    it("should fail if the user has no results", async () => {
      await expect(ResultDal.getLastResult(uid)).rejects.toThrow(
        "No last result found",
      );
    });
  });

  describe("getLastResultTimestamp", () => {
    it("should read the newest timestamp as a number", async () => {
      //GIVEN
      await createDummyData(uid, 1, { timestamp: timestamp - 2000 });
      await createDummyData(uid, 1, { timestamp });

      //WHEN
      const read = await ResultDal.getLastResultTimestamp(uid);

      //THEN
      expect(read).toEqual(timestamp);
      expect(typeof read).toBe("number");
    });

    it("should fail if the user has no results", async () => {
      await expect(ResultDal.getLastResultTimestamp(uid)).rejects.toThrow(
        "No last result found",
      );
    });
  });

  describe("getResultByTimestamp", () => {
    it("should read the result with the given timestamp", async () => {
      //GIVEN
      await createDummyData(uid, 1, { timestamp: timestamp - 2000 });
      const { insertedId } = await ResultDal.addResult(uid, givenResult());

      //WHEN
      const read = await ResultDal.getResultByTimestamp(uid, timestamp);

      //THEN
      expect(read?._id).toEqual(insertedId);
    });

    it("should return null if there is no result with that timestamp", async () => {
      //GIVEN
      await createDummyData(uid, 1);

      //WHEN / THEN
      expect(await ResultDal.getResultByTimestamp(uid, 1)).toBeNull();
    });
  });

  describe("updateTags", () => {
    it("should set the tags of the result", async () => {
      //GIVEN
      const { insertedId } = await ResultDal.addResult(uid, givenResult());
      const tagOne = await UserDal.addTag(uid, "one");
      const tagTwo = await UserDal.addTag(uid, "two");

      //WHEN
      await ResultDal.updateTags(uid, insertedId, [tagOne._id, tagTwo._id]);

      //THEN
      const read = await ResultDal.getResult(uid, insertedId);
      expect(read.tags).toEqual([tagOne._id, tagTwo._id]);
    });

    it("should fail if a tag does not belong to the user", async () => {
      //GIVEN
      const { insertedId } = await ResultDal.addResult(uid, givenResult());
      const otherUid = (await UserTestData.createUser()).uid;
      const foreignTag = await UserDal.addTag(otherUid, "foreign");

      //WHEN / THEN
      await expect(
        ResultDal.updateTags(uid, insertedId, [foreignTag._id]),
      ).rejects.toThrow("One of the tag id's is not valid");
    });

    it("should fail for an unknown result", async () => {
      await expect(ResultDal.updateTags(uid, randomUUID(), [])).rejects.toThrow(
        "Result not found",
      );
    });

    it("should fail for a result of another user", async () => {
      //GIVEN
      const { insertedId } = await ResultDal.addResult(uid, givenResult());
      const otherUid = (await UserTestData.createUser()).uid;

      //WHEN / THEN
      await expect(
        ResultDal.updateTags(otherUid, insertedId, []),
      ).rejects.toThrow("Result not found");
    });
  });

  describe("deleteAll", () => {
    it("should delete only the results of the given user", async () => {
      //GIVEN
      await createDummyData(uid, 3);
      const otherUid = (await UserTestData.createUser()).uid;
      await createDummyData(otherUid, 2);

      //WHEN
      await ResultDal.deleteAll(uid);

      //THEN
      expect(await ResultDal.getResults(uid)).toHaveLength(0);
      expect(await ResultDal.getResults(otherUid)).toHaveLength(2);
    });
  });
});
