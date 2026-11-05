import assert from "node:assert/strict";
import { test } from "node:test";
import { isNetworkError, NETWORK_ERROR, safeCall } from "./network.ts";

test("resultado normal passa direto", async () => {
  assert.deepEqual(await safeCall(async () => ({ ok: 1 })), { ok: 1 });
});

test("falha de rede vira mensagem, em qualquer navegador", async () => {
  for (const text of [
    "Failed to fetch",
    "Load failed",
    "NetworkError when attempting to fetch resource.",
    "Network request failed",
  ]) {
    const result = await safeCall(async () => {
      throw new TypeError(text);
    });
    assert.deepEqual(result, { error: NETWORK_ERROR }, text);
  }
});

test("mensagem própria da chamada é respeitada", async () => {
  const result = await safeCall(async () => {
    throw new TypeError("Failed to fetch");
  }, "texto da venda");
  assert.deepEqual(result, { error: "texto da venda" });
});

test("outros erros continuam subindo (inclusive redirecionamentos do Next)", async () => {
  await assert.rejects(
    safeCall(async () => {
      throw new Error("NEXT_REDIRECT");
    }),
    /NEXT_REDIRECT/,
  );
  await assert.rejects(
    safeCall(async () => {
      throw new TypeError("Cannot read properties of undefined");
    }),
    /Cannot read/,
  );
  await assert.rejects(
    safeCall(async () => {
      throw "texto solto";
    }),
  );
});

test("isNetworkError só reconhece TypeError de rede", () => {
  assert.equal(isNetworkError(new TypeError("Failed to fetch")), true);
  assert.equal(isNetworkError(new Error("Failed to fetch")), false);
  assert.equal(isNetworkError("Failed to fetch"), false);
});
