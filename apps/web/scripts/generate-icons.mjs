// Gera os ícones do app (PNG) com o cavalo do logo da Broomer em branco
// sobre preto, usando o ImageResponse do próprio Next. Rode depois de trocar
// a imagem do cavalo:
//   pnpm --filter web icons
//
// public/brand/broomer-knight-white.png é o cavalo recortado do logo
// (public/brand/broomer-logo.png) e pintado de branco. Ele tem só 77x74 px:
// com um arquivo do logo em alta resolução ou SVG, os ícones grandes ficam
// mais nítidos.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createElement as h } from "react";
// next/og não tem "exports" no package.json: em ESM puro, o caminho leva .js.
import { ImageResponse } from "next/og.js";

const BLACK = "#000000";
const KNIGHT_RATIO = 77 / 74;

const knight = `data:image/png;base64,${(
  await readFile("public/brand/broomer-knight-white.png")
).toString("base64")}`;

// "maskable": o sistema (Android) recorta o ícone em círculo ou outro
// formato; o desenho precisa caber na zona segura central (80%).
function icon({ size, maskable, rounded }) {
  const height = Math.round(size * (maskable ? 0.5 : 0.62));
  return h(
    "div",
    {
      style: {
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BLACK,
        borderRadius: rounded ? Math.round(size * 0.22) : 0,
      },
    },
    h("img", {
      src: knight,
      width: Math.round(height * KNIGHT_RATIO),
      height,
    }),
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
