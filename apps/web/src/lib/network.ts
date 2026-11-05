// Falha de rede ao chamar uma ação do servidor (a internet caiu, a API está
// fora do ar). Sem tratamento, a exceção sobe para a tela de erro e o
// formulário inteiro, com tudo o que a pessoa digitou, desaparece.
//
// Só falhas de rede são convertidas em mensagem. Qualquer outro erro continua
// subindo, inclusive os redirecionamentos internos do Next.js.
export const NETWORK_ERROR =
  "Sem conexão com o servidor. Confira a internet e tente de novo.";

export interface NetworkFailure {
  error: string;
  errors?: never;
}

// "Failed to fetch" (Chrome), "Load failed" (Safari), "NetworkError when
// attempting to fetch resource" (Firefox).
const NETWORK_MESSAGE =
  /failed to fetch|load failed|networkerror|network request failed|fetch failed/i;

export function isNetworkError(error: unknown) {
  return error instanceof TypeError && NETWORK_MESSAGE.test(error.message);
}

export async function safeCall<T>(
  call: () => Promise<T>,
  message = NETWORK_ERROR,
): Promise<T | NetworkFailure> {
  try {
    return await call();
  } catch (error) {
    if (isNetworkError(error)) return { error: message };
    throw error;
  }
}
