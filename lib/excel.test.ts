// 엑셀·CSV 파일 읽기 시험 (PLAN 작업 21)
// creditors.xlsx는 실제 엑셀(Microsoft Excel)로 만든 가상 데이터 파일이다:
//   1행 제목, 3행 머리글(번호·채권자명·신고액·확정 채권액), 4~6행 채권자, 7행 합계(수식), 두 번째 시트 있음

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importCreditorFile, parseCsvRows, pickCreditorColumns, readXlsxRows, toPlainNumber } from "./excel";
import { parsePaste } from "./parse";
import { validateInput } from "./validate";

const fixture = readFileSync(join(__dirname, "__fixtures__", "creditors.xlsx"));
const fixtureBuffer = () => fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength) as ArrayBuffer;
const fileOf = (name: string, data: ArrayBuffer) => ({ name, size: data.byteLength, arrayBuffer: async () => data });

describe("readXlsxRows: 엑셀이 만든 .xlsx 읽기", () => {
  it("첫 번째 시트의 글자·숫자·수식 결과를 읽는다", async () => {
    const rows = await readXlsxRows(fixtureBuffer());
    expect(rows[0][0]).toBe("가상 사건 채권자 목록 (시험용)");
    expect(rows).toContainEqual(["번호", "채권자명", "신고액", "확정 채권액"]);
    expect(rows).toContainEqual(["1", "가상채권자01", "13000000", "12345678"]);
    expect(rows).toContainEqual(["2", "가상&채권자<02>", "3000000", "2345678"]); // XML 특수문자 복원
    expect(rows).toContainEqual(["3", "가상채권자03", "200000000000", "197000000000"]); // 12자리 정수 그대로
    expect(rows).toContainEqual(["", "합계", "", "197014691356"]); // 수식은 계산된 값
    expect(rows.flat()).not.toContain("다른 시트");
  });

  it("엑셀 파일이 아니면 알기 쉬운 오류를 낸다", async () => {
    await expect(readXlsxRows(new TextEncoder().encode("hello").buffer as ArrayBuffer)).rejects.toThrow(".xlsx");
  });
});

describe("pickCreditorColumns: 채권자명·확정 채권액 열 고르기", () => {
  it("머리글을 찾아 두 열만 읽고, 신고액 대신 '확정' 열을 고른다", async () => {
    const r = pickCreditorColumns(await readXlsxRows(fixtureBuffer()));
    expect(r.text.split("\n")).toEqual([
      "채권자명\t확정 채권액",
      "가상채권자01\t12345678",
      "가상&채권자<02>\t2345678",
      "가상채권자03\t197000000000",
      "합계\t197014691356",
    ]);
    expect(r.note).toBe('"채권자명" 열과 "확정 채권액" 열을 읽었습니다 (4행).');
  });

  it("읽은 글은 기존 입력 점검을 그대로 거친다 (합계 행은 오류로 막힘)", async () => {
    const r = pickCreditorColumns(await readXlsxRows(fixtureBuffer()));
    const v = validateInput({ caseNumber: "2026하합1", roundText: "1", poolText: "100000000", parsed: parsePaste(r.text) });
    expect(v.errors.map((e) => e.message).join("\n")).toContain("합계 행으로 보입니다");
  });

  it("머리글이 없고 열이 2개면 그대로 쓴다", () => {
    const r = pickCreditorColumns([["가상채권자01", "100"], ["", ""], ["가상채권자02", "200"]]);
    expect(r.text).toBe("가상채권자01\t100\n가상채권자02\t200");
  });

  it("금액 열을 하나로 정할 수 없으면 모든 열을 넣고 안내한다", () => {
    const r = pickCreditorColumns([["채권자명", "신고 금액", "인정 금액"], ["가상채권자01", "100", "90"]]);
    expect(r.text.split("\n")[1]).toBe("가상채권자01\t100\t90");
    expect(r.note).toContain("열이 3개라");
  });

  it("칸 안의 탭·줄바꿈은 공백으로 바꾼다", () => {
    expect(pickCreditorColumns([["가상\n채권자", "100"]]).text).toBe("가상 채권자\t100");
  });
});

describe("CSV", () => {
  it("따옴표 안의 쉼표·줄바꿈을 처리한다", () => {
    expect(parseCsvRows('채권자명,확정 채권액\r\n"주식회사 ""가나"", 지점","1,234,567"\r\n')).toEqual([
      ["채권자명", "확정 채권액"],
      ['주식회사 "가나", 지점', "1,234,567"],
    ]);
  });

  it("한국어 윈도우 엑셀의 EUC-KR CSV도 읽는다", async () => {
    // "가상채권자01,100" 을 EUC-KR 바이트로 적은 것
    const euckr = new Uint8Array([0xb0, 0xa1, 0xbb, 0xf3, 0xc3, 0xa4, 0xb1, 0xc7, 0xc0, 0xda, 0x30, 0x31, 0x2c, 0x31, 0x30, 0x30]);
    const r = await importCreditorFile(fileOf("목록.csv", euckr.buffer as ArrayBuffer));
    expect(r.text).toBe("가상채권자01\t100");
  });
});

describe("importCreditorFile: 파일 종류·크기", () => {
  it(".xlsx 파일을 읽는다", async () => {
    const r = await importCreditorFile(fileOf("목록.XLSX", fixtureBuffer()));
    expect(r.text.startsWith("채권자명\t확정 채권액\n가상채권자01\t12345678")).toBe(true);
  });

  it("옛 .xls·다른 형식·너무 큰 파일은 막는다", async () => {
    const empty = new ArrayBuffer(0);
    await expect(importCreditorFile(fileOf("목록.xls", empty))).rejects.toThrow("옛 엑셀 형식(.xls)");
    await expect(importCreditorFile(fileOf("목록.pdf", empty))).rejects.toThrow(".xlsx");
    await expect(importCreditorFile({ name: "큰.xlsx", size: 6 * 1024 * 1024, arrayBuffer: async () => empty })).rejects.toThrow("5MB");
  });
});

describe("toPlainNumber: 엑셀 숫자 글자", () => {
  it.each([
    ["12345678", "12345678"],
    ["1.97E+11", "197000000000"],
    ["1E+15", "1000000000000000"],
    ["1.5E-2", "0.015"],
    ["1234.5", "1234.5"],
  ])("%s → %s", (input, output) => {
    expect(toPlainNumber(input)).toBe(output);
  });
});
