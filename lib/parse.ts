// 붙여넣기 해석 (PLAN 작업 5: PRD must 1 규칙 11)
// 엑셀에서 복사한 "채권자명 / 확정 채권액" 두 열을 채권자 목록으로 바꾼다.
// 값이 맞는지 판단(빈칸·0원·인원 제한 등)은 입력 점검(작업 6)이 맡고, 여기서는 읽기만 한다.

export type ParsedRow = {
  /** 붙여넣은 글에서 몇 번째 줄인지 (1부터). 오류 안내에 쓴다. */
  line: number;
  name: string;
  /** 사용자가 넣은 금액 글자 그대로 */
  amountText: string;
  /** 정리한 금액. 1원 단위 정수로 읽을 수 없으면 null */
  amount: bigint | null;
  /** 내용이 있는 열 수 (끝의 빈 칸 제외). 3 이상이면 입력 점검에서 막는다 */
  columnCount: number;
};

export type ParseResult = {
  rows: ParsedRow[];
  /** 첫 줄을 머리글로 보고 건너뛰었는지 */
  headerSkipped: boolean;
  /** 건너뛴 첫 줄의 글 그대로. 화면에 보여줘서 사용자가 확인할 수 있게 한다 */
  headerText: string | null;
  /** 붙여넣은 글이 MAX_PASTE_LENGTH보다 길어 읽지 않았는지 */
  tooLong: boolean;
  /** 보이지 않는 문자를 지운 줄 번호 (입력 점검에서 경고로 알려준다) */
  invisibleLines: number[];
  /** 탭이 없어 공백으로 이름과 금액을 나눈 줄 번호 (나눈 위치가 맞는지 경고로 확인을 부탁한다) */
  spaceSplitLines: number[];
};

/**
 * 보이지 않는 문자: 글자 방향 제어(U+202A~202E, U+2066~2069 등), 폭 없는 공백(U+200B~200D), BOM(U+FEFF),
 * 한글 채움 문자(U+3164 등), 보이지 않는 하이픈(U+00AD), 태그 문자(U+E0000~E007F) 등.
 * 다른 문서에서 복사할 때 섞여 들어오며, 화면·인쇄에서 글자 순서를 뒤집거나 같은 이름을 다르게 보이게 하고,
 * 이름 칸이 비어 보이는데 빈칸 검사를 통과하게 한다 (CHECK 10번, SEC-004).
 * 파일명(csv.ts)도 이 한 곳의 목록을 쓴다. 대상이 ES2017이라 \p{...} 정규식은 못 쓰므로 글자를 하나씩 적는다.
 */
const INVISIBLE = /[\u00AD\u034F\u061C\u115F-\u1160\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u3164\uFEFF\uFFA0\uFFF9-\uFFFB]|\uDB40[\uDC00-\uDC7F]/g;

export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, "");
}

/**
 * 붙여넣기 글자 수 한도. 1,000명 × 한 줄 100자여도 10만 자라 넉넉하다.
 * 이보다 길면 읽지 않는다. 아주 긴 글을 글자마다 다시 읽느라 화면이 멈추는 것을 막는다 (CHECK 9번).
 */
export const MAX_PASTE_LENGTH = 200000;

/** 머리글로 볼 낱말. 채권자명에는 잘 쓰이지 않는 금액 쪽 낱말만 쓴다 ("채권자"는 이름에도 들어가므로 제외) */
const HEADER_WORDS = /금액|채권액|amount/i;

/**
 * 쉼표·공백·"원"·원화 기호(₩, ￦)를 지운 뒤 0 이상의 정수로 읽는다. 음수·소수·글자가 섞이면 null.
 * 엑셀 회계 서식은 0을 "-"로 보여주므로, "-" 하나만 남으면 0으로 읽는다 (입력 점검에서 0원 안내).
 */
/** 이보다 자리가 많은 숫자는 BigInt로 바꾸지 않는다 */
const HUGE_DIGITS = 20;
const HUGE_AMOUNT = BigInt("1" + "0".repeat(HUGE_DIGITS));

export function parseAmount(text: string): bigint | null {
  const cleaned = text.replace(/[,\s원₩￦]/g, "");
  if (cleaned === "-") return BigInt(0);
  if (!/^\d+$/.test(cleaned)) return null;
  // 아주 긴 숫자를 입력할 때마다 BigInt로 바꾸면 화면이 느려진다. 앞의 0을 뺀 뒤 20자리를 넘으면
  // 변환하지 않고 한도(15자리)를 넘는 큰 값 하나로 읽어, 입력 점검이 "너무 큽니다"로 막게 한다 (SEC-003).
  const digits = cleaned.replace(/^0+(?=\d)/, "");
  return digits.length > HUGE_DIGITS ? HUGE_AMOUNT : BigInt(digits);
}

/**
 * 한 줄을 [채권자명, 금액 글자]로 나눈다. 엑셀 복사는 탭으로 나뉜다.
 * 탭이 없으면 맨 끝의 공백 없는 숫자 덩어리 하나만 금액으로 본다 ("가상 채권자 01  1,234,567원" → 이름에 01이 남음).
 */
function splitLine(line: string): [string, string, number, boolean] {
  if (line.includes("\t")) {
    const cells = line.split("\t").map((cell) => cell.trim());
    // 엑셀이 줄 끝에 붙이는 빈 칸은 열로 세지 않는다
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    const [name = "", amount = ""] = cells;
    return [name, amount, cells.length, false];
  }
  const match = line.match(/^(.*\S)\s+([₩￦]?-?[\d,.]+\s?원?)\s*$/);
  if (match) return [match[1].trim(), match[2].trim(), 2, true];
  return [line.trim(), "", 1, false];
}

/**
 * 붙여넣은 글을 행으로 나눈다 (CHECK 12번).
 * - 줄바꿈은 \r\n(윈도우), \n, \r(옛 맥) 모두 받는다.
 * - 엑셀은 칸 안에 줄바꿈(Alt+Enter)이 있으면 그 칸을 "..."로 감싸 복사한다. 감싼 칸 안의 줄바꿈은 공백으로 바꿔 한 행으로 읽는다.
 * line은 그 행이 시작한 줄 번호다.
 */
function splitRecords(text: string): { text: string; line: number }[] {
  const records: { text: string; line: number }[] = [];
  let current = "";
  let line = 1;
  let start = 1;
  let fieldStart = true;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (fieldStart && ch === '"') {
      const quoted = readQuotedCell(text, i);
      if (quoted) {
        current += quoted.value;
        line += quoted.newlines;
        i = quoted.end;
        fieldStart = false;
        continue;
      }
    }
    if (ch === "\r" || ch === "\n") {
      records.push({ text: current, line: start });
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      line += 1;
      start = line;
      current = "";
      fieldStart = true;
      continue;
    }
    current += ch;
    fieldStart = ch === "\t";
    i += 1;
  }
  records.push({ text: current, line: start });
  return records;
}

/** i 위치의 "로 시작하는 칸을 읽는다. 닫는 " 뒤가 탭·줄바꿈·끝이 아니면 감싼 칸이 아니므로 null */
function readQuotedCell(text: string, i: number): { value: string; end: number; newlines: number } | null {
  let value = "";
  let newlines = 0;
  let j = i + 1;
  while (j < text.length) {
    const ch = text[j];
    if (ch === '"') {
      if (text[j + 1] === '"') {
        value += '"';
        j += 2;
        continue;
      }
      const after = text[j + 1];
      return after === undefined || after === "\t" || after === "\r" || after === "\n"
        ? { value, end: j + 1, newlines }
        : null;
    }
    if (ch === "\r" || ch === "\n") {
      j += ch === "\r" && text[j + 1] === "\n" ? 2 : 1;
      newlines += 1;
      value += " ";
      continue;
    }
    value += ch;
    j += 1;
  }
  return null;
}

export function parsePaste(text: string): ParseResult {
  if (text.length > MAX_PASTE_LENGTH) {
    return { rows: [], headerSkipped: false, headerText: null, tooLong: true, invisibleLines: [], spaceSplitLines: [] };
  }
  const rows: ParsedRow[] = [];
  const invisibleLines: number[] = [];
  const spaceSplitLines: number[] = [];
  let headerText: string | null = null;

  splitRecords(text).forEach(({ text: original, line }) => {
    const raw = stripInvisible(original);
    if (raw.trim() === "") return;
    if (raw !== original) invisibleLines.push(line);
    const [name, amountText, columnCount, spaceSplit] = splitLine(raw);
    const amount = parseAmount(amountText);

    // 첫 번째 내용 줄의 금액 칸이 숫자가 아니고, 줄에 머리글 낱말(금액·채권액)이 있을 때만 건너뛴다.
    // 낱말이 없으면 채권자로 남겨서, 금액이 비었으면 입력 점검에서 오류로 알려준다 (조용히 빠지지 않게).
    if (rows.length === 0 && headerText === null && amount === null && HEADER_WORDS.test(raw)) {
      headerText = raw.trim();
      return;
    }
    if (spaceSplit) spaceSplitLines.push(line);
    rows.push({ line, name, amountText, amount, columnCount });
  });

  return { rows, headerSkipped: headerText !== null, headerText, tooLong: false, invisibleLines, spaceSplitLines };
}
