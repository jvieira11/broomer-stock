import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { ConnectionBanner, ServiceWorkerRegister } from "@/components/pwa";
import "./globals.css";

// Mesma fonte do site da Broomer.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
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
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-neutral-50 font-sans text-ink-900">
        <ConnectionBanner />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
