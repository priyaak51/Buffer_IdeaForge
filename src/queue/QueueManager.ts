// src/queue/QueueManager.ts

export interface Order {
  orderId: string;
  customerId: string;
  customerType: "normal" | "vip"; // ← NEW
  items: OrderItem[];
  totalPrepTime: number;
  orderPlacedAt: number;
  estimatedReadyAt: number;
  isAlreadyCooked: boolean; // ← NEW
}

export interface OrderItem {
  foodId: string;
  foodName: string;
  quantity: number;
  prepTimePerItem: number;
  isAlreadyCooked: boolean; // ← NEW
}

interface HeapNode {
  priority: number;
  order: Order;
}

export class PriorityQueue {
  private heap: HeapNode[] = [];

  private getParentIndex(i: number) { return Math.floor((i - 1) / 2); }
  private getLeftIndex(i: number) { return 2 * i + 1; }
  private getRightIndex(i: number) { return 2 * i + 2; }

  private swap(i: number, j: number) {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }

  private heapifyUp(index: number) {
    while (
      index > 0 &&
      this.heap[this.getParentIndex(index)].priority > this.heap[index].priority
    ) {
      this.swap(index, this.getParentIndex(index));
      index = this.getParentIndex(index);
    }
  }

  private heapifyDown(index: number) {
    let smallest = index;
    const left = this.getLeftIndex(index);
    const right = this.getRightIndex(index);

    if (left < this.heap.length && this.heap[left].priority < this.heap[smallest].priority)
      smallest = left;
    if (right < this.heap.length && this.heap[right].priority < this.heap[smallest].priority)
      smallest = right;

    if (smallest !== index) {
      this.swap(index, smallest);
      this.heapifyDown(smallest);
    }
  }

  enqueue(order: Order) {
    // VIP gets priority 1, Normal gets priority 2
    // Within same priority, earlier estimatedReadyAt comes first
    const priorityScore = order.customerType === "vip"
      ? order.estimatedReadyAt - 1_000_000_000 // VIP jumps ahead
      : order.estimatedReadyAt;

    this.heap.push({ priority: priorityScore, order });
    this.heapifyUp(this.heap.length - 1);
  }

  dequeue(): Order | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.heapifyDown(0);
    }
    return top.order;
  }

  peek(): Order | null {
    return this.heap.length > 0 ? this.heap[0].order : null;
  }

  size(): number { return this.heap.length; }

  getAllSorted(): Order[] {
    return [...this.heap]
      .sort((a, b) => a.priority - b.priority)
      .map(n => n.order);
  }
}

export const orderQueue = new PriorityQueue();