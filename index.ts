// index.ts
import { orderQueue, Order, OrderItem } from "./src/queue/QueueManager.ts";
import { stockManager } from "./src/stock/StockManager.ts";
import { pollManager } from "./src/poll/PollManager.ts";
import { calculateWaitingTime, formatWaitTime, calculateOrderPrepTime } from "./src/utils/timeEstimator.ts";
import { db } from "./src/db.ts";

// Load food items from Supabase on server start
async function loadFoodItemsFromDB() {
  const { data, error } = await db.from("food_items").select("*");
  if (error) {
    console.error("Error loading food items:", error.message);
    return;
  }
  stockManager.loadItems(data.map((item: Record<string, unknown>) => ({
    foodId: item.foodId as string,
    foodName: item.foodName as string,
    stock: item.stock as number,
    price: item.price as number,
    isVeg: item.isVeg as boolean,
    prepTimeSeconds: item.prepTimeSeconds as number,
    isAvailable: item.isAvailable as boolean,
  })));
  console.log(`✅ Loaded ${data.length} food items from database`);
}

// Helper to verify Supabase auth token
async function verifyToken(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email! };
}

Deno.serve({ port: 8000 }, async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // ── POST /signup ── customer signs up
  if (path === "/signup" && req.method === "POST") {
    const { email, password, customerType } = await req.json();
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) return Response.json({ error: error.message }, { status: 400 });

    await db.from("customers").insert({
      customerId: data.user!.id,
      email,
      customerType: customerType || "normal",
    });

    return Response.json({ message: "✅ Signup successful!", userId: data.user!.id });
  }

  // ── POST /login ── customer logs in
  if (path === "/login" && req.method === "POST") {
    const { email, password } = await req.json();
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) return Response.json({ error: error.message }, { status: 400 });

    return Response.json({
      message: "✅ Login successful!",
      token: data.session!.access_token,
      userId: data.user!.id,
    });
  }

  // ── GET /menu ── show only available items (customer friendly)
  if (path === "/menu" && req.method === "GET") {
    const items = stockManager.getCustomerView().filter(item => item.status === "✅ Available");
    return Response.json({ items });
  }

  // ── GET /stock ── show ALL items including out of stock
  if (path === "/stock" && req.method === "GET") {
    const items = stockManager.getCustomerView();
    return Response.json({ items });
  }

  // ── POST /order ── place a new order (requires login)
  if (path === "/order" && req.method === "POST") {
    // Verify token
    const user = await verifyToken(req);
    if (!user) return Response.json({ error: "Please login first" }, { status: 401 });

    const body = await req.json();
    const { items, customerType }: { items: OrderItem[]; customerType: "normal" | "vip" } = body;

    // 1. Check stock for all items
    for (const item of items) {
      if (!stockManager.isAvailable(item.foodId, item.quantity)) {
        return Response.json({ error: `${item.foodName} is out of stock` }, { status: 400 });
      }
    }

    // 2. Calculate waiting time
    const { waitSeconds, estimatedReadyAt } = calculateWaitingTime(items, customerType || "normal");

    // 3. Deduct stock and sync to Supabase
    for (const item of items) {
      stockManager.reduceStock(item.foodId, item.quantity);
      const updatedItem = stockManager.getItem(item.foodId);
      if (updatedItem) {
        const { error: stockError } = await db
          .from("food_items")
          .update({ stock: updatedItem.stock, isAvailable: updatedItem.isAvailable })
          .eq("foodId", item.foodId);
        if (stockError) console.error("Error updating stock:", stockError.message);
      }
    }

    // 4. Calculate total price
    let totalPrice = 0;
    for (const item of items) {
      const foodItem = stockManager.getItem(item.foodId);
      if (foodItem) {
        totalPrice += foodItem.price * item.quantity;
      }
    }

    // 5. Create order and add to queue
    const order: Order = {
      orderId: crypto.randomUUID(),
      customerId: user.id,
      customerType: customerType || "normal",
      items,
      totalPrepTime: calculateOrderPrepTime(items),
      orderPlacedAt: Date.now(),
      estimatedReadyAt,
      isAlreadyCooked: items.every(i => i.isAlreadyCooked),
    };
    orderQueue.enqueue(order);

    // 6. Save order to Supabase
    const { error } = await db.from("orders").insert({
      orderId: order.orderId,
      customerId: order.customerId,
      customerType: order.customerType,
      totalPrepTime: order.totalPrepTime,
      orderPlacedAt: order.orderPlacedAt,
      estimatedReadyAt: order.estimatedReadyAt,
      totalPrice: totalPrice,
    });
    if (error) console.error("Error saving order:", error.message);

    return Response.json({
      orderId: order.orderId,
      message: "Order placed!",
      customerType: order.customerType,
      totalPrice: `₹${totalPrice}`,
      waitTime: formatWaitTime(waitSeconds),
      estimatedReadyAt: new Date(estimatedReadyAt).toLocaleTimeString(),
    });
  }

  // ── POST /order/complete ── mark order as completed (admin)
  if (path === "/order/complete" && req.method === "POST") {
    const { orderId } = await req.json();
    const allOrders = orderQueue.getAllSorted();
    const orderExists = allOrders.find(o => o.orderId === orderId);

    if (!orderExists) {
      return Response.json({ error: "Order not found in queue" }, { status: 400 });
    }

    orderQueue.dequeue();

    const { error } = await db.from("orders").delete().eq("orderId", orderId);
    if (error) console.error("Error deleting order:", error.message);

    return Response.json({
      message: `✅ Order ${orderId} completed!`,
      nextOrder: orderQueue.peek(),
    });
  }

  // ── POST /order/cancel ── cancel an order
  if (path === "/order/cancel" && req.method === "POST") {
    const { orderId } = await req.json();
    const { error } = await db.from("orders").delete().eq("orderId", orderId);
    if (error) console.error("Error cancelling order:", error.message);

    return Response.json({ message: `❌ Order ${orderId} has been cancelled!` });
  }

  // ── POST /restock ── admin restocks a food item
  if (path === "/restock" && req.method === "POST") {
    const { foodId, quantity } = await req.json();
    stockManager.addStock(foodId, quantity);
    const updatedItem = stockManager.getItem(foodId);
    if (!updatedItem) return Response.json({ error: "Food item not found" }, { status: 404 });

    const { error } = await db
      .from("food_items")
      .update({ stock: updatedItem.stock, isAvailable: updatedItem.isAvailable })
      .eq("foodId", foodId);
    if (error) console.error("Error restocking:", error.message);

    return Response.json({
      message: `✅ ${updatedItem.foodName} restocked!`,
      newStock: updatedItem.stock,
      isAvailable: updatedItem.isAvailable,
    });
  }

  // ── GET /queue ── see all pending orders
  if (path === "/queue" && req.method === "GET") {
    return Response.json({ orders: orderQueue.getAllSorted() });
  }

  // ── POST /poll/create ── admin creates a poll
  if (path === "/poll/create" && req.method === "POST") {
    const { foodId, foodName, durationMinutes } = await req.json();
    const poll = pollManager.createPoll(crypto.randomUUID(), foodId, foodName, durationMinutes || 10);

    const { error } = await db.from("polls").insert({
      pollId: poll.pollId,
      foodId: poll.foodId,
      foodName: poll.foodName,
      question: poll.question,
      createdAt: poll.createdAt,
      expiresAt: poll.expiresAt,
    });
    if (error) console.error("Error saving poll:", error.message);

    return Response.json({ poll: { ...poll, votes: undefined } });
  }

  // ── POST /poll/vote ── customer votes
  if (path === "/poll/vote" && req.method === "POST") {
    const { pollId, customerId, vote } = await req.json();
    const result = pollManager.vote(pollId, customerId, vote);
    return Response.json(result);
  }

  // ── GET /poll/results?pollId=xxx ── see results
  if (path === "/poll/results" && req.method === "GET") {
    const pollId = url.searchParams.get("pollId") || "";
    const results = pollManager.getResults(pollId);
    if (!results) return Response.json({ error: "Poll not found" }, { status: 404 });
    return Response.json(results);
  }

  return Response.json({ error: "Route not found" }, { status: 404 });

});

await loadFoodItemsFromDB();
console.log("🍽️ Canteen server running on http://localhost:8000");