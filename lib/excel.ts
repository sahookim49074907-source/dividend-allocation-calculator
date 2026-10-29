// 엑셀 파일(.xlsx)·CSV 파일에서 채권자 목록 읽기 (PLAN 작업 21: nice "엑셀 파일 올리기")
// 외부 라이브러리 없이 브라우저 기본 기능(DecompressionStream·TextDecoder)으로 읽는다.
// - 파일은 브라우저 안에서만 읽고 서버로 보내지 않는다 (PRD 7번).
// - 읽은 결과는 붙여넣기 칸과 같은 "채권자명<탭>확정 채권액" 글로 바꿔, 기존 해석·입력 점검을 그대로 거친다.

/** 올릴 수 있는 파일 크기 한도. 채권자 1,000명 목록은 보통 100KB 안쪽이다 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** 압축을 푼 XML 한 개의 한도. 아주 작게 압축된 거대한 파일(압축 폭탄)로 탭이 멈추는 것을 막는다 */
const MAX_XML_BYTES = 30 * 1024 * 1024;

export type ImportResult = {
  /** 붙여넣기 칸에 넣을 글 */
  text: string;
  /** 화면에 보여줄 안내 (어느 열을 읽었는지 등) */
  note: string;
};

// ── ZIP(.xlsx) 풀기 ─────────────────────────────────────────────────────────────

type ZipEntry = { method: number; compressedSize: number; localOffset: number };

function readZipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 끝에서부터 "중앙 디렉터리 끝" 표시(0x06054b50)를 찾는다 (뒤에 주석이 붙을 수 있어 최대 64KB를 거슬러 본다)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("엑셀 파일(.xlsx) 형식이 아닙니다.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new Error("엑셀 파일이 손상됐습니다.");
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    entries.set(name, { method, compressedSize, localOffset });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipText(bytes: Uint8Array, entries: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const entry = entries.get(name);
  if (!entry) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = entry.localOffset;
  if (view.getUint32(p, true) !== 0x04034b50) throw new Error("엑셀 파일이 손상됐습니다.");
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error("지원하지 않는 압축 방식의 엑셀 파일입니다.");

  // deflate 압축 풀기. 너무 커지면 중간에 멈춘다
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_XML_BYTES) {
      await reader.cancel();
      throw new Error("엑셀 파일 내용이 너무 큽니다.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(out);
}

// ── XML 조각 읽기 (엑셀이 만든 정형화된 XML만 다룬다) ───────────────────────────────

function decodeXml(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

/** <si>·<is> 안의 글자: 서식이 섞인 여러 조각(<t>)을 이어 붙이고, 일본어 읽기(<rPh>)는 뺀다 */
function richText(xml: string): string {
  const body = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let text = "";
  for (const m of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += m[1];
  return decodeXml(text);
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** "B12" → 1 (A=0) */
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * 엑셀이 저장한 숫자 글자를 보통 숫자 글자로 바꾼다. "1.97E+11" → "197000000000"
 * 정수는 그대로 두고, 소수는 그대로 남겨 입력 점검이 "1원 단위 정수가 아닙니다"로 알려주게 한다.
 */
export function toPlainNumber(value: string): string {
  const m = value.trim().match(/^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!m) return value.trim();
  const [, sign, int, frac = "", expText] = m;
  const digits = int + frac;
  const exp = Number(expText) - frac.length;
  if (Math.abs(exp) > 40) return value.trim(); // 비정상적으로 큰 지수는 그대로 둔다 (입력 점검에서 막힘)
  let result: string;
  if (exp >= 0) result = digits + "0".repeat(exp);
  else {
    const padded = digits.padStart(-exp + 1, "0");
    result = `${padded.slice(0, exp)}.${padded.slice(exp)}`.replace(/\.?0+$/, "");
  }
  result = result.replace(/^0+(?=\d)/, "");
  return sign + result;
}

/** .xlsx 파일의 첫 번째 시트를 [행][열] 글자 표로 읽는다 */
export async function readXlsxRows(data: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(data);
  const entries = readZipDirectory(bytes);

  // 첫 번째 시트 파일 찾기: workbook.xml의 첫 <sheet> → workbook.xml.rels의 대상 경로
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = await readZipText(bytes, entries, "xl/workbook.xml");
  const rels = await readZipText(bytes, entries, "xl/_rels/workbook.xml.rels");
  const firstSheet = workbook?.match(/<sheet\b([^>]*)\/?>/);
  const relId = firstSheet ? attr(firstSheet[1], "r:id") : null;
  if (rels && relId) {
    for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      if (attr(m[1], "Id") === relId) {
        const target = attr(m[1], "Target") ?? "";
        sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
      }
    }
  }
  const sheet = await readZipText(bytes, entries, sheetPath);
  if (sheet === null) throw new Error("엑셀 파일에서 시트를 찾지 못했습니다.");

  const sharedXml = await readZipText(bytes, entries, "xl/sharedStrings.xml");
  const shared = sharedXml ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => richText(m[1])) : [];

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    let nextColumn = 0;
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] ?? "";
      const ref = attr(attrs, "r");
      const col = ref ? columnIndex(ref) : nextColumn;
      nextColumn = col + 1;
      const type = attr(attrs, "t");
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let text = "";
      if (type === "s" && v !== undefined) text = shared[Number(v)] ?? "";
      else if (type === "inlineStr") text = richText(inner.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
      else if (type === "str" || type === "e") text = v !== undefined ? decodeXml(v) : "";
      else if (type === "b") text = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined) text = toPlainNumber(decodeXml(v));
      while (row.length < col) row.push("");
      row[col] = text;
    }
    rows.push(row);
  }
  return rows;
}

// ── CSV ─────────────────────────────────────────────────────────────────────────

/**
 * CSV 바이트를 글자로 바꾼다. 한국어 윈도우 엑셀의 "CSV (쉼표로 분리)"는 EUC-KR(CP949)로 저장되므로,
 * UTF-8로 읽다가 깨지면 EUC-KR로 다시 읽는다.
 */
export function decodeCsvBytes(data: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("euc-kr").decode(data);
  }
}

/** 쉼표로 나눈 CSV를 [행][열] 표로 읽는다. "..."로 감싼 칸 안의 쉼표·줄바꿈·"" 를 처리한다 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ── 채권자명·확정 채권액 열 고르기 ─────────────────────────────────────────────────

const NAME_HEADER = /채권자|성명|이름|상호|명칭/;
const AMOUNT_HEADER = /채권액|금액/;

/**
 * 표에서 채권자명·확정 채권액 두 열을 골라 붙여넣기 칸에 넣을 글로 바꾼다.
 * 1) 앞쪽 10행 안에 머리글(채권자명·채권액 등)이 있으면 그 두 열만 읽는다.
 *    금액 열이 여럿(신고액·확정 채권액 등)이면 "확정"이 들어간 열 하나만 고른다.
 * 2) 머리글이 없고 내용 있는 열이 2개 이하면 그 열들을 그대로 쓴다.
 * 3) 그 밖에는 모든 열을 넣고, 입력 점검이 "열이 N개입니다"로 알려주게 한다.
 */
export function pickCreditorColumns(table: string[][]): ImportResult {
  // 칸 안의 탭·줄바꿈은 붙여넣기 글의 구분 기호와 겹치므로 공백으로 바꾼다
  const rows = table
    .map((r) => r.map((c) => (c ?? "").replace(/[\t\r\n]+/g, " ").trim()))
    .filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0) throw new Error("파일에 내용이 없습니다.");

  for (let h = 0; h < Math.min(rows.length, 10); h++) {
    const header = rows[h];
    const nameCols = header.flatMap((c, i) => (NAME_HEADER.test(c) && !AMOUNT_HEADER.test(c) ? [i] : []));
    const amountCols = header.flatMap((c, i) => (AMOUNT_HEADER.test(c) ? [i] : []));
    if (nameCols.length === 0 || amountCols.length === 0) continue;
    const confirmed = amountCols.filter((i) => header[i].includes("확정"));
    const amountCol = amountCols.length === 1 ? amountCols[0] : confirmed.length === 1 ? confirmed[0] : -1;
    if (amountCol < 0) break; // 금액 열을 하나로 정할 수 없으면 자동으로 고르지 않는다
    const nameCol = nameCols[0];
    const body = rows
      .slice(h + 1)
      .map((r) => [r[nameCol] ?? "", r[amountCol] ?? ""])
      .filter(([n, a]) => n !== "" || a !== "");
    return {
      text: ["채권자명\t확정 채권액", ...body.map(([n, a]) => `${n}\t${a}`)].join("\n"),
      note: `"${header[nameCol]}" 열과 "${header[amountCol]}" 열을 읽었습니다 (${body.length.toLocaleString()}행).`,
    };
  }

  const usedCols = new Set<number>();
  for (const r of rows) r.forEach((c, i) => c !== "" && usedCols.add(i));
  const cols = [...usedCols].sort((a, b) => a - b);
  const text = rows.map((r) => cols.map((i) => r[i] ?? "").join("\t")).join("\n");
  if (cols.length <= 2) {
    return { text, note: `${rows.length.toLocaleString()}행을 읽었습니다.` };
  }
  return {
    text,
    note: `열이 ${cols.length}개라 채권자명·확정 채권액 열을 자동으로 고르지 못했습니다. 엑셀 첫 줄에 "채권자명"·"확정 채권액" 머리글을 넣거나 두 열만 남겨 다시 올려 주세요.`,
  };
}

/** 파일 하나를 읽어 붙여넣기 칸에 넣을 글로 바꾼다 (.xlsx, .csv) */
export async function importCreditorFile(file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<ImportResult> {
  const lower = file.name.toLowerCase();
  if (file.size > MAX_FILE_BYTES) throw new Error("파일이 너무 큽니다. 5MB 이하 파일만 올릴 수 있습니다.");
  if (lower.endsWith(".xls")) throw new Error("옛 엑셀 형식(.xls)은 읽을 수 없습니다. 엑셀에서 '다른 이름으로 저장 → Excel 통합 문서(.xlsx)'로 저장해 올려 주세요.");
  const data = await file.arrayBuffer();
  if (lower.endsWith(".xlsx")) return pickCreditorColumns(await readXlsxRows(data));
  if (lower.endsWith(".csv")) return pickCreditorColumns(parseCsvRows(decodeCsvBytes(data)));
  throw new Error("엑셀 파일(.xlsx) 또는 CSV 파일(.csv)만 올릴 수 있습니다.");
}
