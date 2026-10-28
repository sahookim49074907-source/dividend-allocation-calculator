export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold">배당안분 계산기</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        배당재원을 채권자별 확정 채권액 비율로 나누고, 안분 내역서(CSV)를 내려받습니다.
      </p>
      {/* 입력 화면(PLAN 작업 11)과 결과 화면(작업 13)이 여기에 들어간다 */}
    </main>
  );
}
