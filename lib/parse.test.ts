// 붙여넣기 해석 시험 (PLAN 작업 5)

import { describe, expect, it } from "vitest";
import { parseAmount, parsePaste } from "./parse";

const simple = (text: string) =>
  parsePaste(text).rows.map((r) => [r.line, r.name, r.amount === null ? null : Number(r.amount)]);

describe("parseAmount: 금액 정리 (규칙 11)", () => {
  it("쉼표·공백·'원'을 지운다", () => {
    expect(parseAmount("1,000,000")).toBe(BigInt(1000000));
    expect(parseAmount("2,500,000원")).toBe(BigInt(2500000));
    expect(parseAmount(" 300 000 ")).toBe(BigInt(300000));
  });

  it("음수·소수·글자는 읽지 않는다", () => {
    expect(parseAmount("-100")).toBeNull();
    expect(parseAmount("100.5")).toBeNull();
    expect(parseAmount("일백만")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("parsePaste: 엑셀 붙여넣기", () => {
  it("머리글을 건너뛰고 탭으로 나눈다", () => {
    const r = parsePaste("채권자명\t확정채권액\r\n가상채권자01\t1,000,000\r\n가상채권자02\t2,500,000원\r\n");
    expect(r.headerSkipped).toBe(true);
    expect(simple("채권자명\t확정채권액\n가상채권자01\t1,000,000")).toEqual([[2, "가상채권자01", 1000000]]);
  });

  it("빈 줄은 건너뛰되 줄 번호는 원래 위치를 유지한다", () => {
    expect(simple("가상채권자01\t5000000\n\n가상채권자02\t3000000\n")).toEqual([
      [1, "가상채권자01", 5000000],
      [3, "가상채권자02", 3000000],
    ]);
  });

  it("탭이 없으면 맨 끝 숫자 덩어리만 금액으로 본다 (이름 끝 숫자가 금액에 붙지 않음)", () => {
    expect(simple("가상 채권자 01  1,234,567원\n가상채권자05 2,000,000 원")).toEqual([
      [1, "가상 채권자 01", 1234567],
      [2, "가상채권자05", 2000000],
    ]);
  });

  it("첫 줄이 금액 빈칸인 데이터는 머리글로 보지 않는다", () => {
    const r = parsePaste("가상채권자01\t\n가상채권자02\t100");
    expect(r.headerSkipped).toBe(false);
    expect(r.rows).toHaveLength(2);
  });

  it("빈 입력은 빈 목록", () => {
    expect(parsePaste("  \n\n").rows).toEqual([]);
  });
});
