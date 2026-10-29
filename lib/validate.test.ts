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

  it("'합계'·'소계' 같은 이름의 행은 채권자로 계산하지 않고 막는다", () => {
    for (const label of ["합계", "소 계", "총계", "계", "Total"]) {
      const r = check({ paste: `가상채권자01\t1,000,000\n가상채권자02\t1,000,000\n${label}\t2,000,000` });
      expect(r.ready).toBeNull();
      expect(r.errors[0].line).toBe(3);
      expect(r.errors[0].message).toContain("합계·소계 행은 빼고");
    }
  });

  it("이름이 없어도 금액이 나머지 합계와 같은 행은 합계 행일 수 있다고 경고한다", () => {
    const r = check({ paste: "가상채권자01\t1,000,000\n가상채권자02\t2,000,000\n가상채권자03\t3,000,000" });
    expect(r.ready).not.toBeNull();
    expect(r.warnings.map((w) => w.line)).toEqual([3]);
    expect(r.warnings[0].message).toContain("합계 행이면 빼고");
    // 채권자가 2명뿐이면 서로 같은 금액일 수 있으므로 경고하지 않는다
    expect(check({ paste: "가상채권자01\t1,000,000\n가상채권자02\t1,000,000" }).warnings).toEqual([]);
  });

  it("열이 3개 이상이면 어느 열이 금액인지 알 수 없으므로 막는다", () => {
    const r = check({ paste: "가상채권자01\t9,000,000\t1,000,000\n가상채권자02\t9,000,000\t2,000,000" });
    expect(r.ready).toBeNull();
    expect(r.errors.map((e) => e.line)).toEqual([1, 2]);
    expect(r.errors[0].message).toContain("열이 3개");
    expect(r.errors[0].message).toContain("숨긴 열");
  });

  it("맨 앞이 번호 열이면 번호 열을 빼라고 알려준다", () => {
    const r = check({ paste: "1\t가상채권자01\t1,000,000\n2\t가상채권자02\t2,000,000" });
    expect(r.ready).toBeNull();
    expect(r.errors[0].message).toContain("맨 앞 번호 열");
  });

  it("₩ 서식 금액도 계산할 수 있다", () => {
    const r = check({ poolText: "₩1,000,000", paste: "가상채권자01\t₩1,000,000\n가상채권자02\t₩ 2,000,000" });
    expect(r.ready?.claims).toEqual([BigInt(1000000), BigInt(2000000)]);
  });

  it("엑셀이 끝에 붙이는 빈 칸(탭)은 열로 세지 않는다", () => {
    expect(check({ paste: "가상채권자01\t1,000,000\t\t\n가상채권자02\t2,000,000\t" }).ready).not.toBeNull();
  });

  it("'합계'가 이름 일부인 채권자는 막지 않는다", () => {
    expect(check({ paste: "합계상사\t1,000,000\n가상채권자02\t1,000,000" }).ready).not.toBeNull();
  });

  it("같은 이름은 경고만 하고 계산은 허용한다 (규칙 10)", () => {
    const r = check({ paste: "가상채권자01\t500000\n가상채권자02\t300000\n가상채권자01\t700000" });
    expect(r.ready).not.toBeNull();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].message).toContain("1, 3행");
  });
});

describe("길이·자릿수 한도 (CHECK 9번)", () => {
  const messages = (r: ReturnType<typeof check>) => r.errors.map((e) => e.message).join("\n");

  it("금액은 15자리(999조 원)까지 받는다", () => {
    expect(check({ poolText: "999999999999999", paste: "가상채권자01\t999,999,999,999,999" }).ready).not.toBeNull();
    expect(messages(check({ poolText: "1000000000000000", paste: "가상채권자01\t100" }))).toContain("배당재원이 너무 큽니다");
    expect(messages(check({ paste: "가상채권자01\t1000000000000000" }))).toContain("1행: 확정 채권액이 너무 큽니다");
  });

  it("총 채권액이 15자리를 넘으면 막는다", () => {
    const r = check({ paste: "가상채권자01\t999999999999999\n가상채권자02\t1" });
    expect(r.ready).toBeNull();
    expect(messages(r)).toContain("총 채권액이 999조 원");
  });

  it("사건번호·차수·채권자명 길이를 제한한다", () => {
    expect(messages(check({ caseNumber: "가".repeat(51), paste: "가상채권자01\t100" }))).toContain("50자까지");
    expect(messages(check({ roundText: "1000", paste: "가상채권자01\t100" }))).toContain("999차까지");
    expect(messages(check({ paste: `${"가".repeat(101)}\t100` }))).toContain("1행: 채권자명이 100자를 넘습니다");
  });

  it("아주 긴 붙여넣기는 읽지 않고 오류로 알려준다", () => {
    const r = check({ paste: "가".repeat(200001) });
    expect(r.ready).toBeNull();
    expect(messages(r)).toContain("붙여넣은 글이 너무 깁니다");
  });
});

describe("보이지 않는 문자 (CHECK 10번)", () => {
  it("이름의 글자 방향 제어·폭 없는 공백을 지우고 경고한다", () => {
    const r = check({ poolText: "700", paste: "가상\u202E채권자01\t100\n가상채권자02\u200B\t200\n가상채권자03\t400" });
    expect(r.ready?.names).toEqual(["가상채권자01", "가상채권자02", "가상채권자03"]);
    expect(r.warnings.map((w) => w.message)).toEqual([
      "1, 2행에 있던 보이지 않는 문자(글자 방향 제어 등)를 지웠습니다. 이름이 맞는지 확인하세요.",
    ]);
  });

  it("보이지 않는 문자만 있는 사건번호는 빈칸으로 본다", () => {
    expect(check({ caseNumber: "\u202E\u200B", paste: "가상채권자01\t100" }).errors[0].message).toBe("사건번호를 입력하세요.");
  });
});

describe("그 밖의 낮음 항목 (CHECK 12번)", () => {
  it("띄어쓰기·(주)/㈜/주식회사 표기만 다른 이름도 같은 이름으로 경고한다", () => {
    const r = check({ poolText: "100", paste: "㈜가나\t100\n주식회사 가나\t200\n(주) 가나\t400\n가상채권자04\t800" });
    expect(r.warnings.map((w) => w.message)).toEqual([
      '같은 이름 "㈜가나"이(가) 1, 2, 3행에 있습니다. 각각 별개의 채권으로 계산합니다.',
    ]);
  });

  it("공백으로 나눈 줄은 확인을 부탁하는 경고를 띄운다", () => {
    const r = check({ poolText: "100", paste: "가상채권자01 100\n가상채권자02\t200" });
    expect(r.ready).not.toBeNull();
    expect(r.warnings[0].message).toContain("1행은(는) 탭이 아닌 공백으로");
  });
});
