// ============================================================
// AI SCHEMA — Conversation history for the local AI assistant
// Group C — AI: conversation log per company
// ============================================================

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./system.schema.ts";

// ─────────────────────────────────────────────────────────────
// AI_CONVERSATIONS
// Stores chat history between users and the Ollama assistant.
// Rows are append-only; one row per message turn.
// ─────────────────────────────────────────────────────────────
export const aiConversations = pgTable("ai_conversations", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull().references(() => companies.id),
  userId:    text("user_id").notNull(),
  role:      text("role").notNull(),     // 'user' | 'assistant'
  content:   text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
