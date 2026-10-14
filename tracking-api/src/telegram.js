// Cliente mínimo da Bot API do Telegram (só fetch, sem biblioteca).
//
// Nunca coloque a URL (que contém o token do bot) em mensagem de erro/log.

class TelegramError extends Error {
  constructor(message, { code, retryAfter } = {}) {
    super(message);
    this.name = 'TelegramError';
    this.code = code;
    this.retryAfter = retryAfter; // segundos (quando o Telegram manda "429 Too Many Requests")
  }
}

function createTelegram({ token, apiBase = 'https://api.telegram.org', fetchImpl = fetch }) {
  async function call(method, params = {}, { timeoutMs = 15000, signal } = {}) {
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (signal) signals.push(signal);

    let res;
    try {
      res = await fetchImpl(`${apiBase}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.any(signals),
      });
    } catch (e) {
      if (signal && signal.aborted) throw e; // parada de propósito (shutdown)
      throw new TelegramError(`${method}: falha de rede (${e.name})`);
    }

    let data;
    try {
      data = await res.json();
    } catch {
      throw new TelegramError(`${method}: resposta inválida (HTTP ${res.status})`, { code: res.status });
    }
    if (!data.ok) {
      throw new TelegramError(`${method}: ${data.description || 'erro'}`, {
        code: data.error_code,
        retryAfter: data.parameters && data.parameters.retry_after,
      });
    }
    return data.result;
  }

  return { call };
}

module.exports = { createTelegram, TelegramError };
