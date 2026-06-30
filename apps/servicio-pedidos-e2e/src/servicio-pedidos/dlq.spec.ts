// @ts-nocheck
import { execFileSync } from 'node:child_process';
import * as amqp from 'amqplib';
import { describe, it, expect } from '@jest/globals';

describe('Dead Letter Queue (DLQ)', () => {
  it('debería confirmar que la DLQ existe y está atada al DLX', async () => {
    if (!process.env.RABBITMQ_URI) {
      verifyDlqThroughDocker();
      return;
    }

    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URI);
      const channel = await connection.createChannel();

      const dlqName = 'dlq.pedidos_queue';

      // Verificamos que al enviar al DLX, llega a la DLQ
      channel.publish('NACHOPPS_DLX', dlqName, Buffer.from(JSON.stringify({ toxic: true })));

      // Esperar a que el mensaje llegue
      await new Promise(resolve => setTimeout(resolve, 1000));

      const msg = await channel.get(dlqName, { noAck: true });
      expect(msg).toBeTruthy();
      if (msg) {
        const content = JSON.parse(msg.content.toString()) as { toxic: boolean };
        expect(content.toxic).toBe(true);
      }

      await channel.close();
      await connection.close();
    } catch {
      verifyDlqThroughDocker();
    }
  });
});

function verifyDlqThroughDocker() {
  const queues = dockerRabbitmq(
    'rabbitmqctl list_queues name arguments --formatter json',
  );
  const parsed = JSON.parse(queues) as Array<{
    name: string;
    arguments: Array<[string, string, string]>;
  }>;

  const pedidosQueue = parsed.find((queue) => queue.name === 'pedidos_queue');
  const dlqQueue = parsed.find((queue) => queue.name === 'dlq.pedidos_queue');

  expect(dlqQueue).toBeDefined();
  expect(pedidosQueue?.arguments).toEqual(
    expect.arrayContaining([
      ['x-dead-letter-exchange', 'longstr', 'NACHOPPS_DLX'],
      ['x-dead-letter-routing-key', 'longstr', 'dlq.pedidos_queue'],
    ]),
  );

  const payload = `e2e-dlq-toxic-${Date.now()}`;
  dockerRabbitmq(
    `rabbitmqadmin -u nachopps -p nachopps_secret publish exchange=NACHOPPS_DLX routing_key=dlq.pedidos_queue payload='${payload}'`,
  );
  const message = dockerRabbitmq(
    'rabbitmqadmin -u nachopps -p nachopps_secret get queue=dlq.pedidos_queue count=1 ackmode=ack_requeue_false',
  );
  expect(message).toContain(payload);
}

function dockerRabbitmq(command: string): string {
  return execFileSync(
    'docker',
    ['exec', 'nachopps-rabbitmq', 'sh', '-lc', command],
    { encoding: 'utf8' },
  );
}
