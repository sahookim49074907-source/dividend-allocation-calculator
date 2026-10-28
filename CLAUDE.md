# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**배당안분 계산기**: 파산사건의 배당재원을 채권자별 확정 채권액 비율로 나누고(안분), 안분 내역서를 CSV로 내려받게 하는 웹 앱이다.

- 기획서 [PRD.md](PRD.md)가 기준 문서다. 기능·규칙·범위를 바꾸기 전에 PRD를 먼저 확인한다.
- PRD의 "AI가 지킬 규칙"(must 1 규칙 1~14, must 2 규칙 1~6)은 구현이 반드시 지켜야 하는 명세다.
- 작업은 PRD "9. 개발 단위" 순서대로 한 단위씩 진행한다.
- 사용자는 비개발자(파산사건 담당자)다. 설명은 한국어로, 초보자 눈높이에 맞춘다.

## 명령어

```bash
npm run dev                          # 개발 서버 (http://localhost:3000, .claude/launch.json의 "next-dev")
npm run build                        # 프로덕션 빌드
npm run lint                         # ESLint (파일 하나: npx eslint lib/allocate.ts)
npx tsc --noEmit -p .                # 타입 검사
npm test                             # 함수 자동 시험 (Vitest, lib/*.test.ts)
npx vitest run lib/csv.test.ts       # 시험 파일 하나만
npx vitest run -t "끝전"             # 이름에 "끝전"이 들어간 시험만
node --no-warnings test-cases/check.mjs   # 계산 정답 시험 (가상 사례 CSV 5건 vs 엑셀 손계산 정답)
```

- **함수 시험:** Vitest 4.1.11을 쓴다. Vitest 5는 `@types/node` 22 이상을 요구해 지금 설정(20)과 맞지 않는다. 시험 파일은 대상 파일 옆에 `이름.test.ts`로 둔다.
- **엑셀 정답 시험:** `test-cases/check.mjs`는 폴더 안의 모든 `*.csv`를 엑셀 손계산 정답과 비교한다. Vitest 시험과는 별개다.

## 이 Next.js 버전 주의 (AGENTS.md)

- Next.js 16.4.3 + React 19.3 이다. 학습 데이터와 API·규칙이 다를 수 있다.
- Next 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 문서를 먼저 읽는다.
- `AGENTS.md`는 `next dev`가 다시 만들어 넣는 파일이므로 지우지 않는다.
- [next.config.ts](next.config.ts)에 `cacheComponents`와 `partialPrefetching`이 켜져 있다.
- Tailwind CSS v4는 PostCSS가 아니라 turbopack 로더(`@tailwindcss/turbopack`)로 CSS에 적용된다. `app/globals.css`에서 `@import "tailwindcss"`로 불러온다.
- `src/` 폴더 없이 App Router(`app/`)를 쓴다. 경로 별칭은 `@/*` → 프로젝트 루트다.

## 구조와 핵심 설계

- **계산 로직:** [lib/allocate.ts](lib/allocate.ts)에 있는 순수 함수들이다. 화면은 `calculateDividends(pool, claims)` 하나만 쓰면 된다. 이 함수는 안분(`allocate`) → 끝전 배분(`distributeLeftover`) → 합계 검증(`verifyTotal`)을 차례로 한다.
- **금액은 모두 `bigint`:** 곱한 값이 9천조를 넘을 수 있어 `number`를 쓰면 원 단위가 틀어진다. 나눗셈은 맨 마지막에 한 번만 한다.
- **BigInt 리터럴 금지:** tsconfig의 `target`이 ES2017이라 `0n` 같은 리터럴은 타입 오류가 난다. `BigInt(0)` 또는 파일 안의 `ZERO`/`ONE` 상수를 쓴다.
- **끝전 규칙:** 버린 원 미만 부분(`remainder`)이 큰 순서로 1원씩 준다. 같으면 목록 앞쪽부터 준다. 끝전은 항상 채권자 수보다 적다.
- **데이터는 브라우저에서만:** 계산과 CSV 생성은 브라우저(클라이언트)에서만 한다. 채권자 데이터를 서버 API로 보내거나 저장·로그로 남기지 않는다 (PRD 7번). 로그인과 DB도 없다.
- **내역서는 CSV:** 엑셀 라이브러리 없이 만든다. UTF-8 BOM, 수식 주입 방지(`= + - @`로 시작하면 `'`를 붙임), 파일명 금지 문자 치환이 필요하다 (PRD must 2).
- **시험 스크립트는 `.mjs`:** tsconfig `include`에 `.mjs`가 없어서, `../lib/allocate.ts`를 import해도 타입 검사·빌드에 걸리지 않는다.
- **시험 CSV 형식:** 1행은 `배당재원`, 2행은 머리글, 3행부터 `번호,채권자명,확정채권액,엑셀정답`이다.
  - **엑셀정답** 열은 사용자가 엑셀로 직접 계산한 값이어야 한다. 앱 코드로 계산해서 채우면 시험의 의미가 없어지므로 Claude가 채우지 않는다.
- **현재 상태:** `app/page.tsx`, `app/layout.tsx`는 아직 create-next-app 기본 화면이다. 입력·결과 화면은 개발 단위 7~8번에서 만든다.

## 범위 제한

- PRD 6번 비범위는 만들지 않는다: 순위가 다른 채권, 여러 차례 배당 누적, 이의 채권 유보, 로그인, 데이터 저장, AI 판단, HWP·PDF 출력, 외부 연동.
- 실제 사건 데이터는 쓰지 않는다. 가상 데이터만 쓰고, 채권자 이름은 `가상채권자01` 같은 형식으로 한다.

## 작업 규칙

### 언어와 보고
- 모든 설명과 코드 주석은 한국어로 쓴다.
- 코드를 바꾸면 무엇을 왜 바꿨는지 한 줄로 알려준다.

### 파일
- 새 파일은 `my-app` 폴더 안에만 만든다.
- 파일을 지워야 할 때는 바로 삭제하지 않는다. `my-app/trash-can/` 폴더(없으면 만든다)로 옮겨만 둔다. 최종 삭제는 사용자가 직접 확인하고 한다.

### 기술 스택과 배포
- 기술 스택은 PRD에 정한 대로 Next.js로 고정한다. 다른 프레임워크로 바꾸거나 마이그레이션을 제안하지 않는다.
- 배포는 Vercel을 사용한다.

### 비밀 정보와 외부 서비스 인증
- `.env`에는 `GITHUB_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `OPENAI_API_KEY`가 들어 있다.
- 토큰 값은 사용자에게 묻지 않고, 채팅이나 명령 출력에도 드러내지 않는다. 확인이 필요하면 "값 있음/없음"으로만 말한다.
- 외부 서비스 인증이 필요하면 `.env`에서 값을 읽어 환경변수로 넘긴다.
  - **Supabase:** 쓸 상황이 생기면 Supabase CLI를 설치하고, `.env`의 `SUPABASE_ACCESS_TOKEN`으로 작업한다.
  - **Vercel:** 배포 등 Vercel 작업이 필요하면 Vercel CLI를 설치하고, `.env`의 `VERCEL_TOKEN`으로 인증해 작업한다.
- 비밀 값 이름에 `NEXT_PUBLIC_`을 붙이지 않는다. 이 이름은 브라우저에 그대로 공개되기 때문이다.

### Git과 커밋
- `.env` 같은 비밀 정보 파일과 `node_modules` 폴더는 `.gitignore`에 등록해 두고, 절대 커밋하지 않는다. 지금은 `.env*`, `/node_modules`, `/trash-can/`, `/.bkit/`이 등록돼 있다.
- 커밋하기 전에 `git status`와 스테이징된 파일 목록으로 `.env` 같은 비밀 값 파일이 들어가지 않았는지 확인한다.
- 커밋 메시지는 한국어로, 무엇을 왜 바꿨는지 한 줄로 쓴다.

### 서브에이전트
- 이미 설치된 서브에이전트(bkit 에이전트 등)는 필요할 때마다 적극 활용한다.

## 작업 절차 (검증 루프)

코드를 바꿀 때마다 아래 순서를 반복한다.

1. **변경한다.**
2. **`npm run lint`와 `npm run build`를 실행**해 오류가 없는지 확인한다.
3. **화면이 바뀐 작업이면 `npm run dev`로 띄워** 실제로 보이는지 확인한다.
4. **문제가 있으면 고치고 다시 1번으로** 돌아간다.
5. **통과하면 git 커밋**으로 그 상태를 남긴다.
   - 커밋 메시지는 한국어로, 무엇을 왜 바꿨는지 한 줄로 쓴다.
   - 검증을 통과하지 못한 상태는 커밋하지 않는다.
6. **무엇을 왜 바꿨는지 한 줄로 요약**해 사용자에게 알려준다.
