import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

function scryptAsync(password: string, salt: Buffer, keylen: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keylen, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

const KEY_LENGTH = 64;

// Formato salvo no banco: scrypt$<salt em hex>$<hash em hex>
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, saltHex, hashHex] = stored.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(
    password,
    Buffer.from(saltHex, 'hex'),
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}
