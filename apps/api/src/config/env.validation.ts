// Falha ao iniciar se a configuração for perigosa ou estiver incompleta,
// em vez de descobrir o problema com o sistema já no ar.
const PLACEHOLDERS = ['troque-por-um-valor-aleatorio', 'changeme', 'secret'];

export function validateEnv(env: Record<string, unknown>) {
  const errors: string[] = [];
  const isProduction = env.NODE_ENV === 'production';

  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL não definida');
  }

  const secret = typeof env.JWT_SECRET === 'string' ? env.JWT_SECRET : '';
  if (!secret) {
    errors.push('JWT_SECRET não definida');
  } else if (PLACEHOLDERS.includes(secret)) {
    errors.push('JWT_SECRET ainda está com o valor de exemplo');
  } else if (isProduction && secret.length < 32) {
    errors.push('JWT_SECRET precisa de pelo menos 32 caracteres em produção');
  }

  if (isProduction && !env.WEB_URL) {
    errors.push('WEB_URL não definida (endereço público do sistema)');
  }

  if (errors.length > 0) {
    throw new Error(`Configuração inválida:\n- ${errors.join('\n- ')}`);
  }
  // Devolve só o que foi validado: as demais variáveis continuam sendo lidas
  // de process.env pelo ConfigService.
  return {
    DATABASE_URL: env.DATABASE_URL,
    JWT_SECRET: env.JWT_SECRET,
    ...pick(env, ['WEB_URL', 'RESEND_API_KEY', 'MAIL_FROM']),
  };
}

// Opcionais que vêm do arquivo .env: o ConfigModule só leva para o
// process.env o que esta função devolve.
function pick(env: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys.filter((key) => env[key]).map((key) => [key, env[key]]),
  );
}
