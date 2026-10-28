// 안분 내역서 CSV 내용 만들기 (PLAN 작업 8: PRD must 2 규칙 1·2·3·5)
// 금액은 엑셀에서 숫자로 계산·합계할 수 있도록 쉼표 없이 정수 그대로 쓴다.

import { dividendRate, totalRate } from "./format";

export type StatementInput = {
  caseNumber: string;
  round: bigint;
  pool: bigint;
  names: string[];
  claims: bigint[];
  /** 검증을 통과한 최종 배당금 (calculateDividends 결과) */
  dividends: bigint[];
  /** 작성일. 내려받는 날짜를 넘긴다 (규칙 2) */
  today: Date;
};

/** 엑셀이 한글을 깨뜨리지 않고 UTF-8로 읽게 하는 표시 (규칙 3) */
const BOM = "﻿";
const ZERO = BigInt(0);

/** 2026-10-28 형식 (사용자 컴퓨터의 날짜 기준) */
export function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 글자 칸 하나를 CSV에 안전하게 넣는다.
 * - = + - @ (그리고 탭·줄바꿈 문자)로 시작하면 엑셀이 수식으로 실행하지 않도록 앞에 ' 를 붙인다 (규칙 5)
 * - 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다
 */
export function textCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildStatementCsv(input: StatementInput): string {
  const { caseNumber, round, pool, names, claims, dividends, today } = input;
  if (names.length !== claims.length || claims.length !== dividends.length) {
    throw new Error("채권자명·채권액·배당금의 개수가 서로 다릅니다.");
  }
  const totalClaims = claims.reduce((sum, c) => sum + c, ZERO);
  const totalDividends = dividends.reduce((sum, d) => sum + d, ZERO);
  if (totalDividends !== pool) throw new Error("배당금 합계가 배당재원과 다릅니다.");

  const lines = [
    // 머리글 (규칙 2)
    `사건번호,${textCell(caseNumber)}`,
    `배당 차수,${round}차`,
    `배당재원,${pool}`,
    `작성일,${formatDate(today)}`,
    "",
    // 표 (규칙 1)
    "번호,채권자명,확정 채권액,배당률(%),배당금",
    ...names.map(
      (name, i) => `${i + 1},${textCell(name)},${claims[i]},${dividendRate(dividends[i], claims[i])},${dividends[i]}`,
    ),
    `합계,,${totalClaims},${totalRate(pool, totalClaims)},${totalDividends}`,
  ];
  return BOM + lines.join("\r\n") + "\r\n";
}
