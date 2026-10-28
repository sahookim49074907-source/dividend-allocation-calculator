// 배당금 안분 계산 (PRD 개발 단위 1: must 1 규칙 1·4)
// 금액은 모두 bigint(정수)로 다룬다. 일반 number는 약 9천조를 넘으면 원 단위가 틀어지기 때문이다.

const ZERO = BigInt(0);
const ONE = BigInt(1);

export type AllocationRow = {
  /** 원 미만을 버린 배당금 */
  amount: bigint;
  /** 버린 원 미만 부분의 분자 (실제 값 = remainder ÷ totalClaims). 끝전 배분(개발 단위 2)에 쓴다. */
  remainder: bigint;
};

export type AllocationResult = {
  rows: AllocationRow[];
  totalClaims: bigint;
  /** 배당재원 − 배당금 합계. 끝전 배분 전에 남은 금액이다. */
  leftover: bigint;
};

/**
 * 배당금 = 배당재원 × (채권액 ÷ 총 채권액), 원 미만 버림.
 * 나눗셈을 맨 마지막에 한 번만 해서 소수 없이 정확하게 계산한다.
 */
export function allocate(pool: bigint, claims: bigint[]): AllocationResult {
  if (pool < ZERO) throw new Error("배당재원은 0원 이상이어야 합니다.");
  if (claims.length === 0) throw new Error("채권자가 1명 이상 있어야 합니다.");
  if (claims.some((c) => c < ONE)) throw new Error("확정 채권액은 1원 이상이어야 합니다.");

  const totalClaims = claims.reduce((sum, c) => sum + c, ZERO);

  const rows = claims.map((claim) => {
    const numerator = pool * claim;
    return { amount: numerator / totalClaims, remainder: numerator % totalClaims };
  });

  const paid = rows.reduce((sum, r) => sum + r.amount, ZERO);
  return { rows, totalClaims, leftover: pool - paid };
}

/**
 * 끝전 배분 (PRD 개발 단위 2: must 1 규칙 2)
 * 남은 끝전을 버린 원 미만 부분이 큰 채권자부터 1원씩 나눠 준다.
 * 원 미만 부분이 같으면 목록에서 먼저 나온 채권자에게 준다.
 * 돌려주는 배열은 입력한 채권자 순서 그대로의 최종 배당금이다.
 */
export function distributeLeftover({ rows, leftover }: AllocationResult): bigint[] {
  // 끝전은 늘 채권자 수보다 적다 (각 원 미만 부분이 1원보다 작기 때문)
  if (leftover < ZERO || leftover >= BigInt(rows.length)) {
    throw new Error("끝전 계산이 맞지 않습니다.");
  }

  const order = rows
    .map((row, index) => ({ remainder: row.remainder, index }))
    .sort((a, b) => {
      if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
      return a.index - b.index;
    });

  const amounts = rows.map((row) => row.amount);
  for (let i = 0; i < Number(leftover); i++) {
    amounts[order[i].index] += ONE;
  }
  return amounts;
}

/**
 * 합계 검증 (PRD 개발 단위 3: must 1 규칙 3)
 * 배당금 합계와 배당재원이 1원이라도 다르면 오류를 낸다.
 */
export function verifyTotal(pool: bigint, amounts: bigint[]): void {
  const total = amounts.reduce((sum, a) => sum + a, ZERO);
  if (total !== pool) {
    const diff = total > pool ? `${total - pool}원 초과` : `${pool - total}원 부족`;
    throw new Error(
      `배당금 합계(${total}원)가 배당재원(${pool}원)보다 ${diff}합니다. 결과를 표시할 수 없습니다.`,
    );
  }
}

/**
 * 안분 계산 → 끝전 배분 → 합계 검증을 차례로 한다.
 * 검증을 통과한 최종 배당금만 돌려주므로, 화면에서는 이 함수 하나만 쓰면 된다.
 */
export function calculateDividends(pool: bigint, claims: bigint[]): bigint[] {
  const amounts = distributeLeftover(allocate(pool, claims));
  verifyTotal(pool, amounts);
  return amounts;
}
