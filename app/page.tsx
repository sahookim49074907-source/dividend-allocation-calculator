import Calculator from "./_components/Calculator";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-14 print:max-w-none print:p-0">
      <header className="mx-auto max-w-3xl text-center print:hidden">
        <p className="text-sm font-bold tracking-widest text-brand dark:text-ice">배당안분 계산기</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl dark:text-white">
          배당재원을 채권액 비율대로, 1원까지 정확하게
        </h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          엑셀에서 붙여넣고 계산하면 안분 내역서(CSV)까지 바로 만들어 줍니다. 입력한 데이터는 이 브라우저를 떠나지 않습니다.
        </p>
      </header>
      <Calculator />
    </main>
  );
}
