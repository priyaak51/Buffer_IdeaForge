// src/poll/PollManager.ts

export interface Poll {
  pollId: string;
  foodId: string;
  foodName: string;
  question: string;
  createdAt: number;
  expiresAt: number;    // timestamp when poll ends
  votes: Map<string, "yes" | "no">; // customerId -> vote (prevents double voting)
}

export class PollManager {
  // HashMap: pollId -> Poll
  private polls: Map<string, Poll> = new Map();

  createPoll(pollId: string, foodId: string, foodName: string, durationMinutes: number): Poll {
    const now = Date.now();
    const poll: Poll = {
      pollId,
      foodId,
      foodName,
      question: `Should we start making ${foodName} now?`,
      createdAt: now,
      expiresAt: now + durationMinutes * 60 * 1000,
      votes: new Map(),
    };
    this.polls.set(pollId, poll);
    return poll;
  }

  vote(pollId: string, customerId: string, vote: "yes" | "no"): {
    success: boolean;
    message: string;
  } {
    const poll = this.polls.get(pollId);
    if (!poll) return { success: false, message: "Poll not found" };
    if (Date.now() > poll.expiresAt) return { success: false, message: "Poll has expired" };
    if (poll.votes.has(customerId)) return { success: false, message: "Already voted" };

    poll.votes.set(customerId, vote);
    return { success: true, message: "Vote recorded" };
  }

  getResults(pollId: string): {
    yes: number;
    no: number;
    total: number;
    recommendation: string;
    isExpired: boolean;
  } | null {
    const poll = this.polls.get(pollId);
    if (!poll) return null;

    let yes = 0, no = 0;
    for (const vote of poll.votes.values()) {
      if (vote === "yes") yes++;
      else no++;
    }

    const total = yes + no;
    const recommendation = yes > no
      ? "✅ Start cooking! Majority wants it."
      : "❌ Not enough demand right now.";

    return {
      yes, no, total,
      recommendation,
      isExpired: Date.now() > poll.expiresAt,
    };
  }

  getActivePoll(foodId: string): Poll | undefined {
    for (const poll of this.polls.values()) {
      if (poll.foodId === foodId && Date.now() <= poll.expiresAt)
        return poll;
    }
    return undefined;
  }
}

export const pollManager = new PollManager();