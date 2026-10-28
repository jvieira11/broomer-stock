import type { MetadataRoute } from "next";

// Faz o navegador oferecer "Instalar Broomer Estoque" (Chrome, Edge, Android,
// Safari): o sistema abre em janela própria, com ícone na área de trabalho ou
// na tela inicial do celular. Servido em /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Broomer Estoque",
    short_name: "Broomer",
    description: "Gestão interna de estoque da Broomer",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Atalhos ao segurar ou clicar com o botão direito no ícone do app.
    shortcuts: [
      {
        name: "Registrar venda",
        short_name: "Venda",
        url: "/movimentacoes/nova?tipo=SALE",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Estoque",
        url: "/estoque",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Estoque baixo",
        url: "/estoque?status=LOW",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
