export interface AgentConfig {
  serverUrl: string;
  key: string;
  agentId: string;
  pollMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const serverUrl = String(env['PRINT_SERVER_URL'] || '').replace(/\/+$/, '');
  const key = String(env['PRINT_AGENT_KEY'] || '');
  const agentId = String(env['PRINT_AGENT_ID'] || 'restaurante');
  const url = new URL(serverUrl || 'http://invalid');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('PRINT_SERVER_URL debe usar HTTPS');
  }
  if (!serverUrl || url.hostname === 'invalid') throw new Error('PRINT_SERVER_URL obligatorio');
  if (key.length < 32) throw new Error('PRINT_AGENT_KEY debe tener al menos 32 caracteres');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(agentId)) throw new Error('PRINT_AGENT_ID inválido');
  const pollMs = Number(env['PRINT_POLL_MS'] || 3000);
  if (!Number.isInteger(pollMs) || pollMs < 1000 || pollMs > 60000) throw new Error('PRINT_POLL_MS fuera de rango');
  return { serverUrl, key, agentId, pollMs };
}
