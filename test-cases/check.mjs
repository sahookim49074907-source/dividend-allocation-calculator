// 계산 정답 시험 (PRD 개발 단위 4)
// test-cases 폴더의 사례 CSV마다 "엑셀정답" 열과 앱 계산 결과를 원 단위까지 비교한다.
// 실행: node test-cases/check.mjs

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateDividends } from "../lib/allocate.ts";

const dir = dirname(fileURLToPath(import.meta.url));

// 쉼표로 나누되 "..." 안의 쉼표는 나누지 않는다 (엑셀이 1,000,000 같은 값을 따옴표로 감싸 저장할 수 있다)
function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

// 쉼표·공백·"원"을 지운 뒤 정수로 바꾼다. 비어 있으면 null
function toAmount(text) {
  const cleaned = (text ?? "").replace(/[,\s원]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+$/.test(cleaned)) throw new Error(`숫자가 아닌 값: "${text}"`);
  return BigInt(cleaned);
}

function checkCase(file) {
  const lines = readFileSync(join(dir, file), "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  // 1행: 배당재원 / 2행: 머리글 / 3행부터: 번호, 채권자명, 확정채권액, 엑셀정답
  const pool = toAmount(splitCsvLine(lines[0])[1]);
  const rows = lines.slice(2).map(splitCsvLine);
  const claims = rows.map((cells) => toAmount(cells[2]));
  const answers = rows.map((cells) => toAmount(cells[3]));

  if (answers.some((a) => a === null)) {
    return { ok: false, message: "엑셀정답 칸이 비어 있는 행이 있습니다." };
  }

  const results = calculateDividends(pool, claims);
  const mismatches = results
    .map((result, i) => ({ row: i + 1, result, answer: answers[i] }))
    .filter(({ result, answer }) => result !== answer);

  if (mismatches.length === 0) {
    return { ok: true, message: `채권자 ${rows.length}명 모두 원 단위까지 일치` };
  }
  const detail = mismatches
    .map(({ row, result, answer }) => `${row}번 행: 앱 ${result}원 / 엑셀 ${answer}원`)
    .join(", ");
  return { ok: false, message: `${mismatches.length}명 불일치 → ${detail}` };
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".csv"))
  .sort();
let passed = 0;
for (const file of files) {
  let outcome;
  try {
    outcome = checkCase(file);
  } catch (e) {
    outcome = { ok: false, message: `읽기·계산 오류: ${e.message}` };
  }
  if (outcome.ok) passed++;
  console.log(`${outcome.ok ? "✅" : "❌"} ${file} — ${outcome.message}`);
}
console.log(`\n결과: ${files.length}건 중 ${passed}건 일치`);
process.exitCode = passed === files.length && files.length > 0 ? 0 : 1;
