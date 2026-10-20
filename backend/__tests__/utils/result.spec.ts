import { describe, it, expect } from "vitest";
import { buildDbResult, DBResult } from "../../src/utils/result";
import { CompletedEvent } from "@monkeytype/schemas/results";

describe("Result Utils", () => {
  describe("buildDbResult", () => {
    it("maps a completed event onto a db result", () => {
      const result = buildDbResult(
        completedEvent({
          uid: "user1",
          wpm: 80,
          rawWpm: 99,
          acc: 86,
          consistency: 23.5,
          keyConsistency: 12,
          charStats: [100, 2, 3, 5],
          mode: "time",
          mode2: "15",
          testDuration: 15.1,
          timestamp: 1000,
        }),
        "Bob",
        true,
      );

      expect(result).toMatchObject({
        _id: "",
        uid: "user1",
        name: "Bob",
        wpm: 80,
        rawWpm: 99,
        acc: 86,
        consistency: 23.5,
        keyConsistency: 12,
        charStats: [100, 2, 3, 5],
        mode: "time",
        mode2: "15",
        testDuration: 15.1,
        timestamp: 1000,
        isPb: true,
      });
    });

    it("keeps the typing fields the api needs", () => {
      const result = buildDbResult(
        completedEvent({
          chartData: { wpm: [1, 2], burst: [50, 55], err: [0, 1] },
        }),
        "Bob",
        false,
      );

      expect(result.chartData).toEqual({
        wpm: [1, 2],
        burst: [50, 55],
        err: [0, 1],
      });
    });

    it("does not carry over the fields that are only used for validation", () => {
      const result = buildDbResult(completedEvent(), "Bob", false) as Record<
        string,
        unknown
      >;

      for (const key of [
        "hash",
        "keyDuration",
        "keySpacing",
        "keyOverlap",
        "lastKeyToEnd",
        "startToFirstKey",
        "wpmConsistency",
        "charTotal",
        "incompleteTests",
        "stopOnLetter",
      ]) {
        expect(result).not.toHaveProperty(key);
      }
    });

    describe("omits default values to keep the stored document small", () => {
      it.for([
        ["bailedOut", { bailedOut: false }],
        ["blindMode", { blindMode: false }],
        ["lazyMode", { lazyMode: false }],
        ["difficulty", { difficulty: "normal" as const }],
        ["funbox", { funbox: [] }],
        ["language", { language: "english" }],
        ["numbers", { numbers: false }],
        ["punctuation", { punctuation: false }],
        ["restartCount", { restartCount: 0 }],
        ["incompleteTestSeconds", { incompleteTestSeconds: 0 }],
        ["afkDuration", { afkDuration: 0 }],
        ["tags", { tags: [] }],
      ] as [keyof DBResult, Partial<CompletedEvent>][])(
        "drops %s",
        ([key, overrides]) => {
          const result = buildDbResult(completedEvent(overrides), "Bob", false);

          expect(result).not.toHaveProperty(key);
        },
      );

      it("drops quoteLength when the mode is not quote", () => {
        const result = buildDbResult(
          completedEvent({ mode: "time", mode2: "15", quoteLength: 3 }),
          "Bob",
          false,
        );

        expect(result).not.toHaveProperty("quoteLength");
      });

      it("drops isPb when the result is not a personal best", () => {
        const result = buildDbResult(completedEvent(), "Bob", false);

        expect(result).not.toHaveProperty("isPb");
      });
    });

    describe("keeps non default values", () => {
      it("keeps the flags that are set", () => {
        const result = buildDbResult(
          completedEvent({
            bailedOut: true,
            blindMode: true,
            lazyMode: true,
            difficulty: "expert",
            funbox: ["58008"],
            language: "german",
            numbers: true,
            punctuation: true,
            restartCount: 4,
            incompleteTestSeconds: 2,
            afkDuration: 5,
            tags: ["tagOne", "tagTwo"],
          }),
          "Bob",
          false,
        );

        expect(result).toMatchObject({
          bailedOut: true,
          blindMode: true,
          lazyMode: true,
          difficulty: "expert",
          funbox: ["58008"],
          language: "german",
          numbers: true,
          punctuation: true,
          restartCount: 4,
          incompleteTestSeconds: 2,
          afkDuration: 5,
          tags: ["tagOne", "tagTwo"],
        });
      });

      it("keeps quoteLength when the mode is quote", () => {
        const result = buildDbResult(
          completedEvent({ mode: "quote", mode2: "123", quoteLength: 3 }),
          "Bob",
          false,
        );

        expect(result.quoteLength).toBe(3);
      });
    });
  });
});

function completedEvent(overrides?: Partial<CompletedEvent>): CompletedEvent {
  return {
    acc: 86,
    afkDuration: 5,
    bailedOut: false,
    blindMode: false,
    charStats: [100, 2, 3, 5],
    chartData: { wpm: [1, 2, 3], burst: [50, 55, 56], err: [0, 2, 0] },
    consistency: 23.5,
    difficulty: "normal",
    funbox: [],
    hash: "hash",
    incompleteTestSeconds: 2,
    incompleteTests: [{ acc: 75, seconds: 10 }],
    keyConsistency: 12,
    keyDuration: [0, 3, 5],
    keySpacing: [0, 2, 4],
    language: "english",
    lazyMode: false,
    mode: "time",
    mode2: "15",
    numbers: false,
    punctuation: false,
    rawWpm: 99,
    restartCount: 4,
    tags: ["tagOneId", "tagTwoId"],
    testDuration: 15.1,
    timestamp: 1000,
    uid: "user1",
    wpmConsistency: 55,
    wpm: 80,
    stopOnLetter: false,
    charTotal: 5,
    keyOverlap: 7,
    lastKeyToEnd: 9,
    startToFirstKey: 11,
    ...overrides,
  };
}
