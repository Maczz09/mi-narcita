import { isPrivateIpv4, printJob } from './printer';
import { loadConfig } from './config';
import type { PrinterJobDto } from '@org/contracts';

const job: PrinterJobDto = { id: 'j1', leaseToken: 'l1', station: 'COCINA', payloadBase64: Buffer.from('abc').toString('base64'),
  destination: { id: 'd1', sedeId: 's1', station: 'COCINA', agentId: 'restaurante', transport: 'NETWORK',
    host: '8.8.8.8', port: 9100, printerName: null, paperWidth: 80, copies: 1, enabled: true } };

describe('agente Windows', () => {
  it('solo admite impresoras en LAN privada', () => {
    expect(isPrivateIpv4('192.168.1.10')).toBe(true);
    expect(isPrivateIpv4('10.0.0.3')).toBe(true);
    expect(isPrivateIpv4('8.8.8.8')).toBe(false);
    expect(isPrivateIpv4('192.168.1.')).toBe(false);
  });
  it('rechaza URL sin HTTPS y secreto corto', () => {
    expect(() => loadConfig({ PRINT_SERVER_URL: 'http://example.com', PRINT_AGENT_KEY: 'x'.repeat(32) })).toThrow('HTTPS');
    expect(() => loadConfig({ PRINT_SERVER_URL: 'https://example.com', PRINT_AGENT_KEY: 'short' })).toThrow('32');
  });
  it('nunca conecta a una IP pública enviada por el servidor', async () => {
    await expect(printJob(job)).rejects.toThrow('IP/puerto');
  });
});
