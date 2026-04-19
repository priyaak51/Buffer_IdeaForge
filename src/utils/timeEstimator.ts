// src/utils/timeEstimator.ts

import { orderQueue, OrderItem } from "../queue/QueueManager.ts";

// Calculate prep time for a single order
// If food is already cooked, prep time is 0
export function calculateOrderPrepTime(items: OrderItem[]): number {
  return items.reduce((total, item) => {
    if (item.isAlreadyCooked) return total; // ← 0 prep time if already cooked
    return total + item.prepTimePerItem * item.quantity;
  }, 0);
}

// Calculate waiting time based on pending orders ahead
export function calculateWaitingTime(
  newOrderItems: OrderItem[],
  customerType: "normal" | "vip"
): {
  waitSeconds: number;
  estimatedReadyAt: number;
} {
  const now = Date.now();
  const allOrders = orderQueue.getAllSorted();

  // VIP customers only wait behind other VIP orders
  // Normal customers wait behind everyone
  const relevantOrders = customerType === "vip"
    ? allOrders.filter(o => o.customerType === "vip")
    : allOrders;

  // Wait starts after the last relevant order finishes
  let latestFinishTime = now;
  if (relevantOrders.length > 0) {
    latestFinishTime = Math.max(
      relevantOrders[relevantOrders.length - 1].estimatedReadyAt,
      now
    );
  }

  const prepTime = calculateOrderPrepTime(newOrderItems) * 1000; // convert to ms
  const estimatedReadyAt = latestFinishTime + prepTime;
  const waitSeconds = Math.ceil((estimatedReadyAt - now) / 1000);

  return { waitSeconds, estimatedReadyAt };
}

export function formatWaitTime(seconds: number): string {
  if (seconds === 0) return "Ready immediately! 🍽️"; // ← already cooked
  if (seconds < 60) return `${seconds} seconds`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins} min ${secs} sec` : `${mins} minutes`;
}