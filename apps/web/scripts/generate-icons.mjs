// Gera os ícones do app (PNG) a partir de um desenho em SVG, usando o
// ImageResponse do próprio Next. Rode depois de mudar o desenho:
//   pnpm --filter web icons
import { mkdir, writeFile } from "node:fs/promises";
import { createElement as h } from "react";
// next/og não tem "exports" no package.json: em ESM puro, o caminho leva .js.
import { ImageResponse } from "next/og.js";

const EMERALD = "#059669";

// Caixa de estoque em perspectiva, em branco, num quadrado de 100x100.
function box(size) {
  return h(
    "svg",
    { width: size, height: size, viewBox: "0 0 100 100" },
    // Tampa
    h("path", { d: "M50 14 L84 31 L50 48 L16 31 Z", fill: "#ffffff" }),
    // Lado esquerdo
    h("path", { d: "M16 36 L47 52 L47 88 L16 72 Z", fill: "#ffffff", opacity: 0.85 }),
    // Lado direito
    h("path", { d: "M84 36 L53 52 L53 88 L84 72 Z", fill: "#ffffff", opacity: 0.7 }),
    // Fita da caixa
    h("path", { d: "M33 22.5 L67 39.5 L67 47 L60 50.5 L60 43 L26 26 Z", fill: EMERALD, opacity: 0.35 }),
  );
}

// "maskable": o sistema (Android) recorta o ícone em círculo ou outro
// formato; o desenho precisa caber na zona segura central (80%).
function icon({ size, maskable, rounded }) {
  const art = Math.round(size * (maskable ? 0.56 : 0.68));
  return h(
    "div",
    {
      style: {
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: EMERALD,
        borderRadius: rounded ? Math.round(size * 0.22) : 0,
      },
    },
    box(art),
  );
}

const targets = [
  // Manifest (instalação no Chrome, Edge e Android)
  { file: "public/icons/icon-192.png", size: 192, rounded: true },
  { file: "public/icons/icon-512.png", size: 512, rounded: true },
  { file: "public/icons/icon-maskable-512.png", size: 512, maskable: true },
  // Aba do navegador e iPhone/iPad (o iOS arredonda os cantos sozinho)
  { file: "src/app/icon.png", size: 64, rounded: true },
  { file: "src/app/apple-icon.png", size: 180 },
];

await mkdir("public/icons", { recursive: true });
for (const target of targets) {
  const image = new ImageResponse(icon(target), {
    width: target.size,
    height: target.size,
  });
  await writeFile(target.file, Buffer.from(await image.arrayBuffer()));
  console.log(`${target.file} (${target.size}x${target.size})`);
}
