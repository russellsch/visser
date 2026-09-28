// Illustrative: one transaction stores the order and its charge request.
export async function acceptOrder(db: Db, request: OrderRequest): Promise<Reply> {
  const order = validate(request);
  await db.transaction(async (tx) => {
    await tx.insert('orders', { ...order, payment: 'pending' });
    await tx.insert('charge_queue', { orderId: order.id, amount: order.amount });
  });
  return { status: 202, body: { orderId: order.id } };
}
