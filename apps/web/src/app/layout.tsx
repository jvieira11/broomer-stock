import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Manrope } from "next/font/google";
import { ConnectionBanner, ServiceWorkerRegister } from "@/components/pwa";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

// Só para a assinatura tipográfica BROOMER (provisória, sem logomarca).
const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: { default: "Broomer Estoque", template: "%s · Broomer" },
  description: "Gestão interna de estoque da Broomer",
  applicationName: "Broomer Estoque",
  // Sistema interno: fora dos buscadores.
  robots: { index: false, follow: false },
  // iPhone/iPad: abre em tela cheia quando adicionado à Tela de Início.
  appleWebApp: {
    capable: true,
    title: "Broomer",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Cor da barra do navegador e da janela do app instalado.
  themeColor: "#1b1b1e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${manrope.variable} ${bodoni.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-stone-50 font-sans text-ink-900">
        <ConnectionBanner />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
