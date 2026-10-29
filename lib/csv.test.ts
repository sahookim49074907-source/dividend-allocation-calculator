// CSV 내용·파일명 시험 (PLAN 작업 8·9)

import { describe, expect, it } from "vitest";
import { calculateDividends } from "./allocate";
import { buildStatementCsv, statementFileName, textCell } from "./csv";

const B = BigInt;

describe("buildStatementCsv (must 2 규칙 1·2·3·5·6)", () => {
  const names = ["가상채권자01", "=SUM(A1:A9)", '주식회사 "가나", 지점'];
  const claims = [B(12345678), B(2345678), B(5000000)];
  const pool = B(10000000);
  const dividends = calculateDividends(pool, claims);
  const csv = buildStatementCsv({
    caseNumber: "2026하합123",
    round: B(1),
    pool,
    names,
    claims,
    dividends,
    today: new Date(2026, 9, 28),
  });

  it("BOM과 윈도우 줄바꿈을 쓴다", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("머리글·표·합계 행 모양이 정해진 대로다", () => {
    expect(csv.slice(1).split("\r\n")).toEqual([
      "사건번호,2026하합123",
      "배당 차수,1차",
      '배당재원,"10,000,000"',
      "작성일,2026-10-28",
      "",
      "번호,채권자명,확정 채권액,배당률(%),배당금",
      '1,가상채권자01,"12,345,678",50.7837,"6,269,593"',
      `2,'=SUM(A1:A9),"2,345,678",50.7837,"1,191,222"`,
      '3,"주식회사 ""가나"", 지점","5,000,000",50.7837,"2,539,185"',
      '합계,,"19,691,356",50.7837,"10,000,000"',
      "",
    ]);
  });

  it("배당금 합계가 배당재원과 다르면 만들지 않는다", () => {
    expect(() =>
      buildStatementCsv({ caseNumber: "x", round: B(1), pool: B(999), names: ["a"], claims: [B(1000)], dividends: [B(998)], today: new Date() }),
    ).toThrow("배당금 합계가 배당재원과 다릅니다");
  });
});

describe("textCell: 엑셀 수식 실행 방지", () => {
  it.each([
    ["=1", "'=1"],
    ["+82", "'+82"],
    ["-가상", "'-가상"],
    ["@가상", "'@가상"],
    ["\t=1", "'\t=1"],
    ["가상채권자", "가상채권자"],
  ])("%j → %j", (input, output) => {
    expect(textCell(input)).toBe(output);
  });
});

describe("statementFileName (must 2 규칙 4)", () => {
  it.each([
    ["2026하합123", 1, "2026하합123_1차배당_안분내역서.csv"],
    ["  2026하합123 ", 2, "2026하합123_2차배당_안분내역서.csv"],
    ["서울회생/2026:하합", 1, "서울회생_2026_하합_1차배당_안분내역서.csv"],
    ['a\\b*c?d"e<f>g|h', 3, "a_b_c_d_e_f_g_h_3차배당_안분내역서.csv"],
    ["a\tb\nc", 1, "a_b_c_1차배당_안분내역서.csv"],
    ["2026하합123.", 1, "2026하합123_1차배당_안분내역서.csv"],
    ["   ", 1, "사건번호없음_1차배당_안분내역서.csv"],
  ])("%j, %d차 → %s", (caseNumber, round, name) => {
    expect(statementFileName(caseNumber, B(round))).toBe(name);
  });
});
