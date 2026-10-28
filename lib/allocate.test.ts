// 안분 계산·끝전 배분·합계 검증 시험 (PLAN 작업 1~3)

import { describe, expect, it } from "vitest";
import { allocate, calculateDividends, distributeLeftover, verifyTotal } from "./allocate";

const B = BigInt;
const won = (...values: number[]) => values.map(B);

describe("allocate: 원 미만 버림 (규칙 1·4)", () => {
  it("나눠떨어지면 끝전이 없다", () => {
    const r = allocate(B(1000000), won(3000000, 2000000, 5000000));
    expect(r.rows.map((x) => x.amount)).toEqual(won(300000, 200000, 500000));
    expect(r.leftover).toBe(B(0));
  });

  it("버리고 남은 끝전을 돌려준다", () => {
    const r = allocate(B(1000), won(1, 1, 1));
    expect(r.rows.map((x) => x.amount)).toEqual(won(333, 333, 333));
    expect(r.leftover).toBe(B(1));
  });

  it("9천조를 넘는 곱셈도 원 단위까지 정확하다", () => {
    const pool = B("123456789012345");
    const claims = [B("987654321098765"), B("123456789")];
    const exact = (pool * claims[0]) / (claims[0] + claims[1]);
    expect(allocate(pool, claims).rows[0].amount).toBe(exact);
  });

  it("잘못된 입력은 막는다", () => {
    expect(() => allocate(B(-1), won(1))).toThrow("배당재원은 0원 이상");
    expect(() => allocate(B(100), [])).toThrow("채권자가 1명 이상");
    expect(() => allocate(B(100), won(0))).toThrow("1원 이상");
  });
});

describe("distributeLeftover: 끝전 배분 (규칙 2)", () => {
  const run = (pool: number, claims: number[]) => distributeLeftover(allocate(B(pool), won(...claims)));

  it("원 미만이 같으면 목록 앞 사람이 받는다", () => {
    expect(run(1000, [1, 1, 1])).toEqual(won(334, 333, 333));
    expect(run(100, [1, 1, 1, 1, 1, 1, 1])).toEqual(won(15, 15, 14, 14, 14, 14, 14));
  });

  it("원 미만이 큰 사람이 받는다 (목록 위치와 무관)", () => {
    expect(run(100, [1, 2, 3])).toEqual(won(17, 33, 50));
    expect(run(100, [3, 2, 1])).toEqual(won(50, 33, 17));
  });
});

describe("verifyTotal / calculateDividends: 합계 검증 (규칙 3)", () => {
  it("합계가 맞으면 통과한다", () => {
    expect(calculateDividends(B(1000), won(1, 1, 1))).toEqual(won(334, 333, 333));
  });

  it("1원 부족·초과는 오류", () => {
    expect(() => verifyTotal(B(1000), won(334, 333, 332))).toThrow("1원 부족");
    expect(() => verifyTotal(B(1000), won(334, 334, 333))).toThrow("1원 초과");
  });

  it("무작위 2,000건: 합계 = 배당재원, 각자 버림값 또는 버림값 + 1원", () => {
    // 매번 같은 숫자가 나오도록 정해진 규칙으로 만든 의사 난수
    let seed = 20261028;
    const next = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    const failures: number[] = [];
    for (let t = 0; t < 2000; t++) {
      const claims = Array.from({ length: 1 + next(50) }, () => B(1 + next(2000000000)) * B(1 + next(500)));
      const total = claims.reduce((a, b) => a + b, B(0));
      const pool = (total * B(next(1000))) / B(1000);
      const base = allocate(pool, claims);
      const final = calculateDividends(pool, claims);
      const sumOk = final.reduce((a, b) => a + b, B(0)) === pool;
      const eachOk = final.every((v, i) => v - base.rows[i].amount === B(0) || v - base.rows[i].amount === B(1));
      if (!sumOk || !eachOk) failures.push(t);
    }
    expect(failures).toEqual([]);
  });
});
