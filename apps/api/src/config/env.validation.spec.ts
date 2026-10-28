import { validateEnv } from './env.validation';

const SECRET = 'x'.repeat(48);

describe('validateEnv', () => {
  it('aceita a configuração mínima de desenvolvimento', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'postgres://x', JWT_SECRET: 'curto-dev' }),
    ).not.toThrow();
  });

  it('exige DATABASE_URL e JWT_SECRET', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL não definida/);
    expect(() => validateEnv({})).toThrow(/JWT_SECRET não definida/);
  });

  it('recusa o JWT_SECRET de exemplo', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgres://x',
        JWT_SECRET: 'troque-por-um-valor-aleatorio',
      }),
    ).toThrow(/valor de exemplo/);
  });

  it('em produção exige segredo longo e WEB_URL', () => {
    const base = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x' };

    expect(() => validateEnv({ ...base, JWT_SECRET: 'curto' })).toThrow(
      /32 caracteres/,
    );
    expect(() => validateEnv({ ...base, JWT_SECRET: SECRET })).toThrow(
      /WEB_URL/,
    );
    expect(() =>
      validateEnv({ ...base, JWT_SECRET: SECRET, WEB_URL: 'https://x.com' }),
    ).not.toThrow();
  });
});
