// Illustrative: the order ID is the idempotency key of the charge.
export async function chargeNext(queue: Queue, provider: Provider, db: Db): Promise<void> {
  const request = await queue.take();
  const result = await provider.charge(request.amount, { idempotencyKey: request.orderId });
  await db.update('orders', request.orderId, { payment: result.ok ? 'paid' : 'failed' });
}
