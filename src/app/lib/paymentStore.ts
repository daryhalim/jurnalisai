// In-memory store for paid order tracking (MVP)
// For production, replace with a database (e.g., Firestore, PostgreSQL)

const paidOrders = new Map<string, { status: string; paidAt: Date }>();

export function markOrderPaid(orderId: string) {
  paidOrders.set(orderId, { status: 'paid', paidAt: new Date() });
}

export function isOrderPaid(orderId: string): boolean {
  const order = paidOrders.get(orderId);
  return order?.status === 'paid';
}

export function getOrderStatus(orderId: string) {
  return paidOrders.get(orderId) || null;
}
