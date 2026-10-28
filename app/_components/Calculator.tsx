"use client";

// 배당안분 계산기 화면 (PLAN 작업 11: 입력 화면, 작업 12: 입력 점검 표시, 작업 13: 결과 표)
// 모든 계산은 브라우저 안에서만 하고, 입력한 데이터를 서버로 보내지 않는다 (PRD 7번).

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { calculateDividends } from "@/lib/allocate";
import { buildStatementCsv, statementFileName } from "@/lib/csv";
import { dividendRate, formatWon, totalRate } from "@/lib/format";
import { parsePaste } from "@/lib/parse";
import { validateInput, type Issue } from "@/lib/validate";

/** 계산이 끝난 한 건의 결과. 화면 표와 CSV가 이 값 하나를 함께 쓴다 */
type Result = {
  caseNumber: string;
  round: bigint;
  pool: bigint;
  names: string[];
  claims: bigint[];
  dividends: bigint[];
};

const ZERO = BigInt(0);

const PASTE_EXAMPLE = "채권자명\t확정 채권액\n가상채권자01\t12,345,678\n가상채권자02\t2,345,678";
/** 오류·경고가 아주 많을 때(최대 1,000행) 화면에 보여줄 개수 */
const MAX_ISSUES_SHOWN = 20;

export default function Calculator() {
  const [caseNumber, setCaseNumber] = useState("");
  const [roundText, setRoundText] = useState("1");
  const [poolText, setPoolText] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [resultCleared, setResultCleared] = useState(false);

  /**
   * 입력 칸이 바뀌면 이전 결과를 지운다 (PLAN 작업 14: 규칙 13)
   * 예전 결과를 그대로 내려받는 실수를 막기 위해, 다시 계산해야 결과와 내려받기가 나타난다.
   */
  function onInput(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      if (result) setResultCleared(true);
      setResult(null);
      setCalcError(null);
    };
  }

  const parsed = parsePaste(pasteText);
  // 입력이 바뀔 때마다 바로 점검한다. 오류가 하나라도 있으면 계산 버튼을 막는다 (규칙 8)
  const validation = validateInput({ caseNumber, roundText, poolText, parsed });
  const canCalculate = validation.ready !== null;
  // 아무것도 넣지 않은 처음 화면에서는 오류 목록을 띄우지 않는다
  const touched = caseNumber !== "" || poolText !== "" || pasteText.trim() !== "";

  // 입력한 내용이 있을 때 새로고침하거나 창을 닫으려 하면 확인 창을 띄운다 (PLAN 작업 15: 규칙 14)
  // 데이터를 저장하지 않으므로(PRD 7번) 페이지를 떠나면 입력이 모두 사라진다.
  // 확인 창의 문구는 브라우저가 정하며, 직접 바꿀 수 없다.
  useEffect(() => {
    if (!touched) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ""; // 오래된 브라우저 호환용
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [touched]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ready = validation.ready;
    if (!ready) return;
    setResultCleared(false);
    try {
      // 안분 → 끝전 배분 → 합계 검증. 1원이라도 맞지 않으면 오류가 나서 결과를 보여주지 않는다 (규칙 3)
      const dividends = calculateDividends(ready.pool, ready.claims);
      setResult({ caseNumber: caseNumber.trim(), ...ready, dividends });
      setCalcError(null);
    } catch (e) {
      setResult(null);
      setCalcError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-3 print:hidden">
        <legend className="mb-2 text-lg font-semibold">사건 정보</legend>
        <Field label="사건번호" htmlFor="caseNumber">
          <input
            id="caseNumber"
            value={caseNumber}
            onChange={(e) => onInput(setCaseNumber)(e.target.value)}
            placeholder="예: 2026하합123"
            className={inputClass}
          />
        </Field>
        <Field label="배당 차수" htmlFor="round">
          <div className="flex items-center gap-2">
            <input
              id="round"
              value={roundText}
              onChange={(e) => onInput(setRoundText)(e.target.value)}
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
            onChange={(e) => onInput(setPoolText)(e.target.value)}
            inputMode="numeric"
            placeholder="예: 10,000,000"
            className={`${inputClass} text-right`}
          />
        </Field>
      </fieldset>

      <div className="print:hidden">
        <label htmlFor="creditors" className="text-lg font-semibold">
          채권자 목록
        </label>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          엑셀에서 <b>채권자명</b>과 <b>확정 채권액</b> 두 열을 복사해 붙여넣으세요. 첫 줄의 머리글은 자동으로 건너뜁니다.
        </p>
        <textarea
          id="creditors"
          value={pasteText}
          onChange={(e) => onInput(setPasteText)(e.target.value)}
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

      {touched && validation.errors.length > 0 && (
        <IssueList tone="error" title="계산하려면 아래를 고쳐 주세요" issues={validation.errors} />
      )}
      {validation.warnings.length > 0 && (
        <IssueList tone="warning" title="확인해 주세요 (계산은 할 수 있습니다)" issues={validation.warnings} />
      )}

      <div className="flex items-center gap-3 print:hidden">
        <button
          type="submit"
          disabled={!canCalculate}
          className="rounded-md bg-blue-600 px-6 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          계산하기
        </button>
        {!touched && (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">모든 칸을 채우면 계산할 수 있습니다.</span>
        )}
      </div>

      {resultCleared && (
        <p role="status" className="rounded-md bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800 print:hidden">
          입력이 바뀌어 이전 계산 결과를 지웠습니다. [계산하기]를 다시 눌러 주세요.
        </p>
      )}
      {calcError && <IssueList tone="error" title="계산 결과를 표시할 수 없습니다" issues={[{ message: calcError }]} />}
      {result && <ResultTable result={result} />}
    </form>
  );
}

function ResultTable({ result }: { result: Result }) {
  const { caseNumber, round, pool, names, claims, dividends } = result;
  const totalClaims = claims.reduce((sum, c) => sum + c, ZERO);
  const totalDividends = dividends.reduce((sum, d) => sum + d, ZERO);
  const verified = totalDividends === pool;

  /**
   * 안분 내역서 CSV 내려받기 (PLAN 작업 16: must 2)
   * 화면 표와 같은 result 값으로 만들므로 숫자가 1원도 다를 수 없다 (규칙 6).
   * 파일은 브라우저 안에서 만들어 바로 저장하며, 서버로 보내지 않는다.
   */
  function download() {
    const csv = buildStatementCsv({ ...result, today: new Date() });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = statementFileName(caseNumber, round);
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      aria-labelledby="result-title"
      className="space-y-3 border-t border-zinc-200 pt-6 dark:border-zinc-800 print:border-0 print:pt-0"
    >
      {/* 인쇄할 때만 보이는 제목 (PLAN 작업 20) */}
      <h1 className="hidden text-center text-xl font-bold print:block">파산배당금 안분 내역서</h1>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h2 id="result-title" className="text-lg font-semibold">
          계산 결과
        </h2>
        {verified && (
          <div className="flex flex-wrap gap-2">
            {/* 인쇄하기 (PLAN 작업 20): 브라우저 인쇄 기능을 쓰고, 입력 칸·버튼은 인쇄용 스타일로 숨긴다 */}
            <button type="button" onClick={() => window.print()} className={secondaryButtonClass}>
              인쇄하기
            </button>
            <button type="button" onClick={download} className={secondaryButtonClass}>
              안분 내역서 내려받기 (CSV)
            </button>
          </div>
        )}
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {caseNumber} · {round.toString()}차 배당 · 배당재원 {formatWon(pool)}원 · 채권자 {names.length.toLocaleString()}명
      </p>
      <p
        className={`rounded-md px-3 py-2 text-sm font-medium ${
          verified
            ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
            : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
        }`}
      >
        {verified ? "✅" : "❌"} 배당금 합계 {formatWon(totalDividends)}원 {verified ? "=" : "≠"} 배당재원 {formatWon(pool)}원
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-300 dark:border-zinc-700">
              <th className="px-2 py-2 text-right">번호</th>
              <th className="px-2 py-2 text-left">채권자명</th>
              <th className="px-2 py-2 text-right">확정 채권액</th>
              <th className="px-2 py-2 text-right">배당률(%)</th>
              <th className="px-2 py-2 text-right">배당금</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {names.map((name, i) => (
              <tr key={i} className="border-b border-zinc-200 dark:border-zinc-800">
                <td className="px-2 py-1.5 text-right">{i + 1}</td>
                <td className="px-2 py-1.5">{name}</td>
                <td className="px-2 py-1.5 text-right">{formatWon(claims[i])}</td>
                <td className="px-2 py-1.5 text-right">{dividendRate(dividends[i], claims[i])}</td>
                <td className="px-2 py-1.5 text-right">{formatWon(dividends[i])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="tabular-nums font-semibold">
            <tr className="border-t-2 border-zinc-300 dark:border-zinc-700">
              <td className="px-2 py-2" colSpan={2}>
                합계
              </td>
              <td className="px-2 py-2 text-right">{formatWon(totalClaims)}</td>
              <td className="px-2 py-2 text-right">{totalRate(pool, totalClaims)}</td>
              <td className="px-2 py-2 text-right">{formatWon(totalDividends)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function IssueList({ tone, title, issues }: { tone: "error" | "warning"; title: string; issues: Issue[] }) {
  const styles =
    tone === "error"
      ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
  const shown = issues.slice(0, MAX_ISSUES_SHOWN);
  const hidden = issues.length - shown.length;

  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border p-4 text-sm print:hidden ${styles}`}>
      <p className="font-semibold">
        {tone === "error" ? "❌" : "⚠"} {title} ({issues.length.toLocaleString()}건)
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {shown.map((issue, i) => (
          <li key={i}>{issue.message}</li>
        ))}
      </ul>
      {hidden > 0 && <p className="mt-2">외 {hidden.toLocaleString()}건이 더 있습니다.</p>}
    </div>
  );
}

const secondaryButtonClass =
  "rounded-md border border-blue-600 px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950";

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
