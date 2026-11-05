import { BadRequestException } from '@nestjs/common';
import { SanitizeInputPipe } from './sanitize-input.pipe';

const pipe = new SanitizeInputPipe();
const body = { type: 'body' as const };

describe('SanitizeInputPipe', () => {
  it('deixa passar dados normais, com acentos, emoji e valores vazios', () => {
    const value = {
      name: 'Camisa Linho São João 😀',
      items: [{ variantId: 'x', quantity: 1, unitCost: null }],
      notes: '',
    };
    expect(pipe.transform(value, body)).toBe(value);
    expect(pipe.transform('texto solto', { type: 'query' })).toBe(
      'texto solto',
    );
    expect(pipe.transform(undefined, body)).toBeUndefined();
  });

  it('recusa o caractere nulo em qualquer lugar do corpo, da consulta ou do caminho', () => {
    for (const value of [
      'a\u0000b',
      { name: 'a\u0000b' },
      { items: [{ reason: 'ok' }, { reason: 'x\u0000' }] },
    ]) {
      expect(() => pipe.transform(value, body)).toThrow(BadRequestException);
    }
    expect(() => pipe.transform('a\u0000', { type: 'query' })).toThrow(
      BadRequestException,
    );
    expect(() => pipe.transform('a\u0000', { type: 'param' })).toThrow(
      BadRequestException,
    );
  });

  it('recusa dados com níveis demais sem estourar a pilha', () => {
    let deep: unknown = {};
    for (let i = 0; i < 50_000; i++) deep = { a: deep };
    expect(() => pipe.transform(deep, body)).toThrow(BadRequestException);
  });

  it('aceita até 20 níveis e não mexe nos parâmetros personalizados (usuário logado)', () => {
    let ok: unknown = 'fim';
    for (let i = 0; i < 20; i++) ok = { a: ok };
    expect(() => pipe.transform(ok, body)).not.toThrow();
    const user = { name: 'a\u0000b' };
    expect(pipe.transform(user, { type: 'custom' })).toBe(user);
  });
});
