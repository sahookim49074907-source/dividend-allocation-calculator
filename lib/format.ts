// 표시 형식 (PLAN 작업 7: PRD must 1 규칙 12, must 2 규칙 1)
// 화면과 CSV가 같은 글자를 쓰도록 숫자를 글자로 바꾸는 일은 모두 여기서 한다.
// 컴퓨터 언어 설정에 따라 달라지지 않도록 toLocaleString 대신 직접 만든다.

const ZERO = BigInt(0);
const TWO = BigInt(2);
/** 배당률 % 값을 소수 넷째 자리까지 정수로 다루기 위한 배수 (100% × 10^4) */
const RATE_SCALE = BigInt(1000000);

/** 1234567 → "1,234,567" */
export function formatWon(value: bigint): string {
  const sign = value < ZERO ? "-" : "";
  const digits = (value < ZERO ? -value : value).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * numerator ÷ denominator 를 % 로, 소수 넷째 자리까지 반올림해 표시한다.
 * 예: 1 ÷ 3 → "33.3333", 2 ÷ 3 → "66.6667"
 * 표시 전용이며 배당금 계산에는 쓰지 않는다.
 */
export function formatRate(numerator: bigint, denominator: bigint): string {
  if (denominator <= ZERO) throw new Error("배당률의 분모는 0보다 커야 합니다.");
  // 반올림: (분자 × 배수 × 2 + 분모) ÷ (분모 × 2)
  const scaled = (numerator * RATE_SCALE * TWO + denominator) / (denominator * TWO);
  const text = scaled.toString().padStart(5, "0");
  return `${text.slice(0, -4)}.${text.slice(-4)}`;
}

/** 채권자별 배당률 = 배당금 ÷ 확정 채권액 (규칙 12) */
export function dividendRate(dividend: bigint, claim: bigint): string {
  return formatRate(dividend, claim);
}

/** 합계 행 배당률 = 배당재원 ÷ 총 확정 채권액 (must 2 규칙 1) */
export function totalRate(pool: bigint, totalClaims: bigint): string {
  return formatRate(pool, totalClaims);
}
