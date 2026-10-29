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

  it("엑셀 통화·회계 서식의 ₩ 표시를 지운다", () => {
    expect(parseAmount("₩1,000,000")).toBe(BigInt(1000000));
    expect(parseAmount("₩ 1,000,000")).toBe(BigInt(1000000));
    expect(parseAmount("￦2,500")).toBe(BigInt(2500)); // 전각 원화 기호
  });

  it("회계 서식에서 0을 뜻하는 '-'는 0으로 읽는다 (입력 점검에서 0원 안내)", () => {
    expect(parseAmount("-")).toBe(BigInt(0));
    expect(parseAmount("₩ -")).toBe(BigInt(0));
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

  it("탭이 없을 때도 ₩ 서식 금액을 읽는다", () => {
    expect(simple("가상채권자01 ₩1,234,567")).toEqual([[1, "가상채권자01", 1234567]]);
  });

  it("첫 줄이 금액 빈칸인 데이터는 머리글로 보지 않는다", () => {
    const r = parsePaste("가상채권자01\t\n가상채권자02\t100");
    expect(r.headerSkipped).toBe(false);
    expect(r.rows).toHaveLength(2);
  });

  it("이름에 숫자가 없고 금액이 빈 첫 줄도 채권자로 남긴다 (조용히 빠지지 않음)", () => {
    const r = parsePaste("주식회사 가나\t\n가상채권자02\t100");
    expect(r.headerSkipped).toBe(false);
    expect(r.rows.map((row) => row.name)).toEqual(["주식회사 가나", "가상채권자02"]);
  });

  it("머리글 낱말(금액·채권액)이 있는 첫 줄만 건너뛰고, 건너뛴 글을 알려준다", () => {
    const tab = parsePaste("채권자명\t확정 채권액(원)\n가상채권자01\t100");
    expect(tab.headerSkipped).toBe(true);
    expect(tab.headerText).toBe("채권자명\t확정 채권액(원)");
    expect(tab.rows).toHaveLength(1);

    const space = parsePaste("성명 금액\n가상채권자01 100");
    expect(space.headerSkipped).toBe(true);
    expect(space.rows.map((row) => row.name)).toEqual(["가상채권자01"]);

    // 머리글 낱말이 없으면 숫자가 아니어도 건너뛰지 않는다 (입력 점검에서 오류로 알려줌)
    expect(parsePaste("가나다\t라마바\n가상채권자01\t100").headerSkipped).toBe(false);
  });

  it("빈 입력은 빈 목록", () => {
    expect(parsePaste("  \n\n").rows).toEqual([]);
  });
});

describe("parsePaste: 줄바꿈과 칸 안 줄바꿈 (CHECK 12번)", () => {
  it("옛 맥 줄바꿈(\r)도 줄로 나눈다", () => {
    expect(simple("가상채권자01\t100\r가상채권자02\t200")).toEqual([
      [1, "가상채권자01", 100],
      [2, "가상채권자02", 200],
    ]);
  });

  it("엑셀이 따옴표로 감싼 칸 안의 줄바꿈은 공백으로 바꿔 한 행으로 읽는다", () => {
    expect(simple('"가상\n채권자01"\t100\r\n가상채권자02\t200')).toEqual([
      [1, "가상 채권자01", 100],
      [3, "가상채권자02", 200],
    ]);
    // 칸 안의 따옴표는 엑셀이 두 번 써서 복사한다
    expect(simple('"주식회사 ""가나""\n지점"\t100')).toEqual([[1, '주식회사 "가나" 지점', 100]]);
  });

  it("따옴표로 시작해도 감싼 칸이 아니면 글자 그대로 둔다", () => {
    expect(simple('"가나"상사\t100')).toEqual([[1, '"가나"상사', 100]]);
  });

  it("공백으로 나눈 줄 번호를 알려준다", () => {
    expect(parsePaste("가상채권자01 100\n가상채권자02\t200").spaceSplitLines).toEqual([1]);
  });
});
