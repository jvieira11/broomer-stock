"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Evento que Chrome, Edge e Android disparam quando o app pode ser instalado.
// Não existe no Safari (iPhone/Mac), por isso o aviso com instruções.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Registra o service worker (página "sem conexão"). Só em produção: no
// desenvolvimento ele atrapalharia o recarregamento automático.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Sem service worker o sistema funciona igual, só sem a página offline.
      });
  }, []);
  return null;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

// Aviso fixo quando a internet cai: sem conexão, nada é salvo.
export function ConnectionBanner() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white"
    >
      Sem conexão com a internet. As alterações não serão salvas até a conexão
      voltar.
    </div>
  );
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari no iOS
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Valores fixos do aparelho: não mudam enquanto a página está aberta.
const subscribeNever = () => () => {};

// Botão "Instalar app" no menu. Some quando o app já está instalado.
export function InstallAppButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHint, setShowHint] = useState(false);
  // No iPhone não há evento de instalação: mostramos como instalar pelo Safari.
  const iosHint = useSyncExternalStore(
    subscribeNever,
    () => isIos() && !isStandalone(),
    () => false,
  );

  useEffect(() => {
    if (isStandalone()) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (prompt) {
    return (
      <button
        type="button"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-brass-400 transition hover:bg-white/5"
      >
        <DownloadIcon />
        Instalar app
      </button>
    );
  }

  if (iosHint) {
    return (
      <div className="px-3">
        <button
          type="button"
          onClick={() => setShowHint((value) => !value)}
          className="flex items-center gap-2 py-2 text-sm font-medium text-brass-400"
        >
          <DownloadIcon />
          Instalar no iPhone
        </button>
        {showHint && (
          <p className="pb-2 text-xs text-stone-400">
            No Safari, toque em <strong>Compartilhar</strong> e depois em{" "}
            <strong>Adicionar à Tela de Início</strong>.
          </p>
        )}
      </div>
    );
  }

  return null;
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path d="M10 3a1 1 0 0 1 1 1v7.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L9 11.6V4a1 1 0 0 1 1-1Z" />
      <path d="M4 15a1 1 0 0 1 1 1h10a1 1 0 1 1 0 2H5a2 2 0 0 1-2-2 1 1 0 0 1 1-1Z" />
    </svg>
  );
}
