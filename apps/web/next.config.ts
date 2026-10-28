import path from "node:path";
import type { NextConfig } from "next";

// Raiz do monorepo: o build "standalone" precisa enxergar o node_modules de lá.
const monorepoRoot = path.resolve(process.cwd(), "../..");

const securityHeaders = [
  // Impede que o sistema seja embutido em outro site (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Gera um servidor enxuto em .next/standalone para a imagem Docker.
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  poweredByHeader: false,
  experimental: {
    // Importação de produtos: planilha de até 5 MB (a API tem o mesmo limite),
    // com folga para o envelope do formulário.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Service worker: sempre buscado de novo (atualizações chegam na hora)
        // e só pode carregar scripts do próprio site.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
