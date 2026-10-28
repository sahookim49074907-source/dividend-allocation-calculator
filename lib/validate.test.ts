// 입력 점검 시험 (PLAN 작업 6)

import { describe, expect, it } from "vitest";
import { parsePaste } from "./parse";
import { validateInput } from "./validate";

const check = ({ caseNumber = "2026하합123", roundText = "1", poolText = "1000000", paste = "" }) =>
  validateInput({ caseNumber, roundText, poolText, parsed: parsePaste(paste) });
const creditors = (n: number, amount = 1000) =>
  Array.from({ length: n }, (_, i) => `가상채권자${i + 1}\t${amount}`).join("\n");

describe("validateInput", () => {
  it("정상 입력이면 계산할 값을 돌려준다", () => {
    const r = check({ paste: "채권자명\t금액\n가상채권자01\t600000\n가상채권자02\t900000" });
    expect(r.errors).toEqual([]);
    expect(r.ready?.claims).toEqual([BigInt(600000), BigInt(900000)]);
  });

  it("사건 정보가 비면 막는다", () => {
    const r = check({ caseNumber: " ", roundText: "", poolText: "0", paste: "가상채권자01\t100" });
    expect(r.ready).toBeNull();
    expect(r.errors.map((e) => e.message)).toEqual([
      "사건번호를 입력하세요.",
      "배당 차수는 1 이상의 정수로 입력하세요.",
      "배당재원은 1원 이상의 정수로 입력하세요.",
    ]);
  });

  it("빈칸·잘못된 금액·0원은 행 번호와 함께 막는다 (규칙 6·8)", () => {
    const r = check({ paste: "가상채권자01\t\n\t500\n가상채권자03\t-100\n가상채권자04\t0" });
    expect(r.ready).toBeNull();
    expect(r.errors.map((e) => e.line)).toEqual([1, 2, 3, 4]);
    expect(r.errors[3].message).toContain("0원 채권자는 목록에서 빼고");
  });

  it("채권자는 1,000명까지 (규칙 7)", () => {
    expect(check({ paste: "채권자명\t금액" }).errors[0].message).toBe("채권자 목록을 붙여넣으세요.");
    expect(check({ poolText: "1000", paste: creditors(1000) }).ready).not.toBeNull();
    expect(check({ paste: creditors(1001) }).errors[0].message).toContain("1,000명까지 지원합니다");
  });

  it("배당재원이 총 채권액보다 크면 막는다 (규칙 9)", () => {
    const paste = "가상채권자01\t1,000,000\n가상채권자02\t1,000,000";
    expect(check({ poolText: "2000000", paste }).ready).not.toBeNull();
    expect(check({ poolText: "2,000,001", paste }).errors[0].message).toContain("배당재원이 총 채권액을 넘습니다");
  });

  it("같은 이름은 경고만 하고 계산은 허용한다 (규칙 10)", () => {
    const r = check({ paste: "가상채권자01\t500000\n가상채권자02\t300000\n가상채권자01\t700000" });
    expect(r.ready).not.toBeNull();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].message).toContain("1, 3행");
  });
});
