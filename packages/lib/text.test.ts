import { describe, expect, it } from "vitest";

import { truncate, truncateOnWord } from "./text";

describe("Text util tests", () => {
  describe("fn: truncateOnWord", () => {
    it("should respect the maxLength parameter instead of a hardcoded constant", () => {
      const text = "the quick brown fox jumps over the lazy dog ".repeat(10);
      const result158 = truncateOnWord(text, 158);
      const result100 = truncateOnWord(text, 100);
      expect(result158.length).toBeLessThanOrEqual(158 + 3);
      expect(result100.length).toBeLessThanOrEqual(100 + 3);
      expect(result158).not.toBe("...");
      expect(result100).not.toBe("...");
    });

    it("should preserve text when no space exists within maxLength", () => {
      const text = "a".repeat(200);
      const result = truncateOnWord(text, 100);
      expect(result).toBe("a".repeat(100) + "...");
    });

    it("should return the original text when shorter than maxLength", () => {
      expect(truncateOnWord("short", 100)).toBe("short");
    });
  });

  describe("fn: truncate", () => {
    it("should return the original text when it is shorter than the max length", () => {
      const cases = [
        {
          input: "Hello world",
          maxLength: 100,
          expected: "Hello world",
        },
        {
          input: "Hello world",
          maxLength: 11,
          expected: "Hello world",
        },
      ];

      for (const { input, maxLength, expected } of cases) {
        const result = truncate(input, maxLength);

        expect(result).toEqual(expected);
      }
    });

    it("should return the truncated text when it is longer than the max length", () => {
      const cases = [
        {
          input: "Hello world",
          maxLength: 10,
          expected: "Hello w...",
        },
        {
          input: "Hello world",
          maxLength: 5,
          expected: "He...",
        },
      ];

      for (const { input, maxLength, expected } of cases) {
        const result = truncate(input, maxLength);

        expect(result).toEqual(expected);
      }
    });

    it("should return the truncated text without ellipsis when it is longer than the max length and ellipsis is false", () => {
      const cases = [
        {
          input: "Hello world",
          maxLength: 10,
          ellipsis: false,
          expected: "Hello w",
        },
        {
          input: "Hello world",
          maxLength: 5,
          ellipsis: false,
          expected: "He",
        },
      ];

      for (const { input, maxLength, ellipsis, expected } of cases) {
        const result = truncate(input, maxLength, ellipsis);

        expect(result).toEqual(expected);
      }
    });
  });
  describe("fn: truncateOnWord", () => {
    it("should return the original text when it is shorter than the max length", () => {
      const cases = [
        {
          input: "Hello world",
          maxLength: 100,
          expected: "Hello world",
        },
        {
          input: "Hello world",
          maxLength: 11,
          expected: "Hello world",
        },
      ];

      for (const { input, maxLength, expected } of cases) {
        const result = truncateOnWord(input, maxLength);

        expect(result).toEqual(expected);
      }
    });

    it("should return the truncated text on the last word when it is longer than the max length", () => {
      const cases = [
        {
          input: "The quick brown fox jumps over the lazy dog",
          maxLength: 12,
          expected: "The quick...",
        },
        {
          input: "Cal.com is the scheduling infrastructure for everyone",
          maxLength: 14,
          expected: "Cal.com is...",
        },
      ];

      for (const { input, maxLength, expected } of cases) {
        const result = truncateOnWord(input, maxLength);

        expect(result).toEqual(expected);
      }
    });

    it("should return the truncated text without ellipsis when it is longer than the max length and ellipsis is false", () => {
      const cases = [
        {
          input: "The quick brown fox jumps over the lazy dog",
          maxLength: 12,
          ellipsis: false,
          expected: "The quick",
        },
      ];

      for (const { input, maxLength, ellipsis, expected } of cases) {
        const result = truncateOnWord(input, maxLength, ellipsis);

        expect(result).toEqual(expected);
      }
    });

    it("should fallback to character truncation when no spaces are present in the truncated segment", () => {
      const cases = [
        {
          input: "supercalifragilisticexpialidocious",
          maxLength: 10,
          expected: "supercalif...",
        },
        {
          input: "https://cal.com/pro/30min/extremely-long-url-without-any-spaces",
          maxLength: 20,
          expected: "https://cal.com/pro/...",
        },
      ];

      for (const { input, maxLength, expected } of cases) {
        const result = truncateOnWord(input, maxLength);
        expect(result).toEqual(expected);
      }
    });
  });
});
