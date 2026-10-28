import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * 보안 헤더 (CHECK 4번)
 * 이 Next.js 문서(node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md)의
 * "Without Nonces" 방식을 따른다. 미리 만들어 두는 정적 페이지 방식을 그대로 유지할 수 있다.
 * - connect-src 'self': 채권자 데이터를 다른 서버로 보내는 것을 브라우저가 막는다 (PRD 7번의 안전망)
 * - frame-ancestors 'none': 다른 사이트가 이 계산기를 자기 화면 안에 넣지 못하게 한다
 * - 개발 서버는 'unsafe-eval'이 필요하고, http://localhost에서는 https 강제(upgrade-insecure-requests)를 빼야 한다
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 응답에 "X-Powered-By: Next.js"를 붙이지 않는다 (CHECK 4번)
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
