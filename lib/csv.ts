// 안분 내역서 CSV 내용 만들기 (PLAN 작업 8: PRD must 2 규칙 1·2·3·5)
// 금액은 "1,234,567"처럼 쉼표를 넣고 따옴표로 감싼다. 엑셀이 숫자로 읽고(합계·계산 가능) 쉼표 서식까지 붙여 준다.
// 쉼표 없는 정수로 쓰면 엑셀이 11자리 이상 금액을 1.23E+10처럼 지수로 보여준다 (CHECK 8번).

import { dividendRate, formatWon, totalRate } from "./format";
import { stripInvisible } from "./parse";

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

/** 금액 칸: "1,234,567" (쉼표가 있어 따옴표로 감싼다) */
function moneyCell(value: bigint): string {
  return `"${formatWon(value)}"`;
}

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

/**
 * 내려받을 파일명: 사건번호_N차배당_안분내역서.csv (PLAN 작업 9: must 2 규칙 4)
 * 사건번호에 파일명으로 쓸 수 없는 문자(/ \ : * ? " < > | 와 제어 문자)는 _ 로 바꾼다.
 * 윈도우는 끝의 점·공백을 지워 버리므로 미리 정리한다.
 */
export function statementFileName(caseNumber: string, round: bigint): string {
  const safeCase =
    stripInvisible(caseNumber)
      .trim()
      .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/, "") || "사건번호없음";
  return `${safeCase}_${round}차배당_안분내역서.csv`;
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
    `배당재원,${moneyCell(pool)}`,
    `작성일,${formatDate(today)}`,
    "",
    // 표 (규칙 1)
    "번호,채권자명,확정 채권액,배당률(%),배당금",
    ...names.map(
      (name, i) =>
        `${i + 1},${textCell(name)},${moneyCell(claims[i])},${dividendRate(dividends[i], claims[i])},${moneyCell(dividends[i])}`,
    ),
    `합계,,${moneyCell(totalClaims)},${totalRate(pool, totalClaims)},${moneyCell(totalDividends)}`,
  ];
  return BOM + lines.join("\r\n") + "\r\n";
}
