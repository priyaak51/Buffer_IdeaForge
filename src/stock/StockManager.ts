// src/stock/StockManager.ts

export interface FoodItem {
  foodId: string;
  foodName: string;
  stock: number;
  price: number;
  isVeg: boolean;
  prepTimeSeconds: number;
  isAvailable: boolean;
}

export class StockManager {
  // HashMap: foodId -> FoodItem
  private stockMap: Map<string, FoodItem> = new Map();

  // Load items (call this when server starts, from DB)
  loadItems(items: FoodItem[]) {
    for (const item of items) {
      this.stockMap.set(item.foodId, item);
    }
  }

  getItem(foodId: string): FoodItem | undefined {
    return this.stockMap.get(foodId);
  }

  getAllItems(): FoodItem[] {
    return Array.from(this.stockMap.values());
  }

  getAvailableItems(): FoodItem[] {
    return this.getAllItems().filter(item => item.isAvailable && item.stock > 0);
  }

  // Customer friendly view (hides stock count)
  getCustomerView() {
    return this.getAllItems().map(item => ({
      foodId: item.foodId,
      foodName: item.foodName,
      price: `₹${item.price}`,
      isVeg: item.isVeg ? "🟢 Veg" : "🔴 Non-Veg",
      prepTime: `${Math.floor(item.prepTimeSeconds / 60)} mins`,
      status: item.stock === 0 ? "❌ Out of Stock" : "✅ Available",
    }));
  }

  // Reduce stock when order is placed
  reduceStock(foodId: string, quantity: number): boolean {
    const item = this.stockMap.get(foodId);
    if (!item) return false;
    if (item.stock < quantity) return false;
    item.stock -= quantity;
    if (item.stock === 0) item.isAvailable = false;
    return true;
  }

  // Admin restocks an item
  addStock(foodId: string, quantity: number) {
    const item = this.stockMap.get(foodId);
    if (!item) return;
    item.stock += quantity;
    if (item.stock > 0) item.isAvailable = true;
  }

  isAvailable(foodId: string, quantity: number): boolean {
    const item = this.stockMap.get(foodId);
    return !!item && item.isAvailable && item.stock >= quantity;
  }
}

export const stockManager = new StockManager();