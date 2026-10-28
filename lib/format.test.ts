// 표시 형식 시험 (PLAN 작업 7)

import { describe, expect, it } from "vitest";
import { formatRate, formatWon } from "./format";

const B = BigInt;

describe("formatWon: 천 단위 쉼표", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1,000"],
    [1234567, "1,234,567"],
  ])("%d → %s", (value, text) => {
    expect(formatWon(B(value))).toBe(text);
  });

  it("아주 큰 금액", () => {
    expect(formatWon(B("123456789012345"))).toBe("123,456,789,012,345");
  });
});

describe("formatRate: 배당률 % 소수 넷째 자리 반올림 (규칙 12)", () => {
  it.each([
    [1, 3, "33.3333"],
    [2, 3, "66.6667"],
    [5, 5, "100.0000"],
    [0, 7, "0.0000"],
    [1, 1000000, "0.0001"],
    [1, 2000000, "0.0001"], // 0.00005% → 반올림 올림
    [1, 2000001, "0.0000"], // 0.00005%보다 아주 조금 작음 → 내림
  ])("%d ÷ %d → %s%%", (n, d, text) => {
    expect(formatRate(B(n), B(d))).toBe(text);
  });

  it("분모 0은 막는다", () => {
    expect(() => formatRate(B(1), B(0))).toThrow("분모는 0보다");
  });
});
