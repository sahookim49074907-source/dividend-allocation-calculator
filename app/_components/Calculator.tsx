"use client";

// 배당안분 계산기 화면 (PLAN 작업 11: 입력 화면)
// 모든 계산은 브라우저 안에서만 하고, 입력한 데이터를 서버로 보내지 않는다 (PRD 7번).

import { useState, type FormEvent, type ReactNode } from "react";
import { parsePaste } from "@/lib/parse";

const PASTE_EXAMPLE = "채권자명\t확정 채권액\n가상채권자01\t12,345,678\n가상채권자02\t2,345,678";

export default function Calculator() {
  const [caseNumber, setCaseNumber] = useState("");
  const [roundText, setRoundText] = useState("1");
  const [poolText, setPoolText] = useState("");
  const [pasteText, setPasteText] = useState("");

  const parsed = parsePaste(pasteText);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // 입력 점검(작업 12)과 계산·결과 표시(작업 13)를 여기에 연결한다
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-lg font-semibold">사건 정보</legend>
        <Field label="사건번호" htmlFor="caseNumber">
          <input
            id="caseNumber"
            value={caseNumber}
            onChange={(e) => setCaseNumber(e.target.value)}
            placeholder="예: 2026하합123"
            className={inputClass}
          />
        </Field>
        <Field label="배당 차수" htmlFor="round">
          <div className="flex items-center gap-2">
            <input
              id="round"
              value={roundText}
              onChange={(e) => setRoundText(e.target.value)}
              inputMode="numeric"
              className={`${inputClass} w-20 text-right`}
            />
            <span>차</span>
          </div>
        </Field>
        <Field label="배당재원 (원)" htmlFor="pool">
          <input
            id="pool"
            value={poolText}
            onChange={(e) => setPoolText(e.target.value)}
            inputMode="numeric"
            placeholder="예: 10,000,000"
            className={`${inputClass} text-right`}
          />
        </Field>
      </fieldset>

      <div>
        <label htmlFor="creditors" className="text-lg font-semibold">
          채권자 목록
        </label>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          엑셀에서 <b>채권자명</b>과 <b>확정 채권액</b> 두 열을 복사해 붙여넣으세요. 첫 줄의 머리글은 자동으로 건너뜁니다.
        </p>
        <textarea
          id="creditors"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={PASTE_EXAMPLE}
          rows={12}
          spellCheck={false}
          className={`${inputClass} mt-2 w-full font-mono text-sm`}
        />
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
          읽은 채권자 {parsed.rows.length.toLocaleString()}명
          {parsed.headerSkipped && " (첫 줄 머리글 건너뜀)"}
        </p>
      </div>

      <button
        type="submit"
        className="rounded-md bg-blue-600 px-6 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        계산하기
      </button>
    </form>
  );
}

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900 focus:outline-2 focus:outline-blue-600";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
