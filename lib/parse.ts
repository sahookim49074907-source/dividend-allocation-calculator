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
};

/**
 * 보이지 않는 문자: 글자 방향 제어(U+202A~202E, U+2066~2069 등), 폭 없는 공백(U+200B~200D), BOM(U+FEFF).
 * 다른 문서에서 복사할 때 섞여 들어오며, 화면·인쇄에서 글자 순서를 뒤집거나 같은 이름을 다르게 보이게 한다 (CHECK 10번).
 */
const INVISIBLE = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

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
export function parseAmount(text: string): bigint | null {
  const cleaned = text.replace(/[,\s원₩￦]/g, "");
  if (cleaned === "-") return BigInt(0);
  return /^\d+$/.test(cleaned) ? BigInt(cleaned) : null;
}

/**
 * 한 줄을 [채권자명, 금액 글자]로 나눈다. 엑셀 복사는 탭으로 나뉜다.
 * 탭이 없으면 맨 끝의 공백 없는 숫자 덩어리 하나만 금액으로 본다 ("가상 채권자 01  1,234,567원" → 이름에 01이 남음).
 */
function splitLine(line: string): [string, string, number] {
  if (line.includes("\t")) {
    const cells = line.split("\t").map((cell) => cell.trim());
    // 엑셀이 줄 끝에 붙이는 빈 칸은 열로 세지 않는다
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    const [name = "", amount = ""] = cells;
    return [name, amount, cells.length];
  }
  const match = line.match(/^(.*\S)\s+([₩￦]?-?[\d,.]+\s?원?)\s*$/);
  if (match) return [match[1].trim(), match[2].trim(), 2];
  return [line.trim(), "", 1];
}

export function parsePaste(text: string): ParseResult {
  if (text.length > MAX_PASTE_LENGTH) {
    return { rows: [], headerSkipped: false, headerText: null, tooLong: true, invisibleLines: [] };
  }
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  const invisibleLines: number[] = [];
  let headerText: string | null = null;

  lines.forEach((original, i) => {
    const raw = stripInvisible(original);
    if (raw.trim() === "") return;
    if (raw !== original) invisibleLines.push(i + 1);
    const [name, amountText, columnCount] = splitLine(raw);
    const amount = parseAmount(amountText);

    // 첫 번째 내용 줄의 금액 칸이 숫자가 아니고, 줄에 머리글 낱말(금액·채권액)이 있을 때만 건너뛴다.
    // 낱말이 없으면 채권자로 남겨서, 금액이 비었으면 입력 점검에서 오류로 알려준다 (조용히 빠지지 않게).
    if (rows.length === 0 && headerText === null && amount === null && HEADER_WORDS.test(raw)) {
      headerText = raw.trim();
      return;
    }
    rows.push({ line: i + 1, name, amountText, amount, columnCount });
  });

  return { rows, headerSkipped: headerText !== null, headerText, tooLong: false, invisibleLines };
}
