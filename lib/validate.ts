// 입력 점검 (PLAN 작업 6: PRD must 1 규칙 6~10)
// 오류(errors)가 하나라도 있으면 [계산하기]를 막는다. 경고(warnings)는 알려주기만 하고 계산은 허용한다.

import { parseAmount, type ParseResult } from "./parse";

export const MAX_CREDITORS = 1000;

export type Issue = {
  /** 붙여넣은 글의 줄 번호. 사건 정보 칸의 문제면 없음 */
  line?: number;
  message: string;
};

export type CaseInput = {
  caseNumber: string;
  roundText: string;
  poolText: string;
  parsed: ParseResult;
};

export type ValidationResult = {
  errors: Issue[];
  warnings: Issue[];
  /** 오류가 없을 때만 채워진다. 계산 함수에 바로 넘길 수 있는 값 */
  ready: { pool: bigint; round: bigint; names: string[]; claims: bigint[] } | null;
};

const ZERO = BigInt(0);
const TWO = BigInt(2);
/** 엑셀에서 표 아래 합계 줄까지 같이 복사했을 때의 이름 (공백을 지운 뒤 이름 전체가 같을 때만) */
const TOTAL_ROW_NAME = /^(합계|소계|총계|총합계|계|합|total|subtotal|sum)$/i;

export function validateInput({ caseNumber, roundText, poolText, parsed }: CaseInput): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  // 사건 정보 칸
  if (caseNumber.trim() === "") errors.push({ message: "사건번호를 입력하세요." });

  const round = parseAmount(roundText);
  if (round === null || round === ZERO) errors.push({ message: "배당 차수는 1 이상의 정수로 입력하세요." });

  const pool = parseAmount(poolText);
  if (pool === null || pool === ZERO) errors.push({ message: "배당재원은 1원 이상의 정수로 입력하세요." });

  // 채권자 수 (규칙 7)
  const { rows } = parsed;
  if (rows.length === 0) {
    errors.push({ message: "채권자 목록을 붙여넣으세요." });
  } else if (rows.length > MAX_CREDITORS) {
    errors.push({ message: `채권자는 ${MAX_CREDITORS.toLocaleString()}명까지 지원합니다. (지금 ${rows.length.toLocaleString()}명)` });
  }

  // 행마다 빈칸·금액 확인 (규칙 6·8)
  for (const row of rows) {
    // 열이 3개 이상이면 어느 열이 확정 채권액인지 알 수 없어 다른 금액(예: 신고액)으로 계산될 수 있다 (CHECK 2번)
    if (row.columnCount > 2) {
      errors.push({
        line: row.line,
        message: `${row.line}행: 열이 ${row.columnCount}개입니다. 채권자명과 확정 채권액 두 열만 복사하세요. (엑셀에서 숨긴 열도 함께 복사될 수 있습니다)`,
      });
      continue;
    }
    if (row.name === "") {
      errors.push({ line: row.line, message: `${row.line}행: 채권자명이 비어 있습니다.` });
    } else if (TOTAL_ROW_NAME.test(row.name.replace(/\s/g, ""))) {
      // 합계 행이 채권자로 들어가면 총 채권액이 두 배가 되어 모든 배당금이 오류 없이 틀린다 (CHECK 1번)
      errors.push({
        line: row.line,
        message: `${row.line}행: "${row.name}"은(는) 합계 행으로 보입니다. 합계·소계 행은 빼고 채권자만 붙여넣으세요.`,
      });
    }
    if (row.amountText === "") {
      errors.push({ line: row.line, message: `${row.line}행: 확정 채권액이 비어 있습니다.` });
    } else if (row.amount === null) {
      errors.push({ line: row.line, message: `${row.line}행: 확정 채권액 "${row.amountText}"은(는) 1원 단위 정수가 아닙니다.` });
    } else if (row.amount === ZERO) {
      errors.push({ line: row.line, message: `${row.line}행: 확정 채권액이 0원입니다. 0원 채권자는 목록에서 빼고 입력하세요.` });
    }
  }

  // 같은 이름 (규칙 10): 막지 않고 경고만
  const linesByName = new Map<string, number[]>();
  for (const row of rows) {
    if (row.name === "") continue;
    linesByName.set(row.name, [...(linesByName.get(row.name) ?? []), row.line]);
  }
  for (const [name, lines] of linesByName) {
    if (lines.length > 1) {
      warnings.push({
        line: lines[0],
        message: `같은 이름 "${name}"이(가) ${lines.join(", ")}행에 있습니다. 각각 별개의 채권으로 계산합니다.`,
      });
    }
  }

  if (errors.length > 0) return { errors, warnings, ready: null };

  // 여기부터는 모든 값이 정상이다
  const claims = rows.map((row) => row.amount as bigint);
  const totalClaims = claims.reduce((sum, c) => sum + c, ZERO);

  // 이름이 "합계"가 아니어도 금액이 나머지 채권액 합계와 같으면 합계 행일 수 있다 (CHECK 1번).
  // 우연히 같을 수도 있으므로 막지 않고 경고만 한다. 2명뿐이면 서로 같은 금액일 수 있어 건너뛴다.
  if (rows.length >= 3) {
    claims.forEach((claim, i) => {
      if (claim * TWO === totalClaims) {
        const line = rows[i].line;
        warnings.push({
          line,
          message: `${line}행 금액이 나머지 채권액을 모두 더한 값과 같습니다. 합계 행이면 빼고 붙여넣으세요.`,
        });
      }
    });
  }

  // 배당재원이 총 채권액보다 큰 경우 (규칙 9)
  if ((pool as bigint) > totalClaims) {
    errors.push({
      message: `배당재원이 총 채권액을 넘습니다. (배당재원 ${(pool as bigint).toLocaleString()}원 > 총 채권액 ${totalClaims.toLocaleString()}원)`,
    });
    return { errors, warnings, ready: null };
  }

  return {
    errors,
    warnings,
    ready: { pool: pool as bigint, round: round as bigint, names: rows.map((row) => row.name), claims },
  };
}
