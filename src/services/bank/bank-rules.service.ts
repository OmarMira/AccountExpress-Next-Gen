import { db } from "../../db/connection.ts";
import { bankRules } from "../../db/schema/bank-rules.schema";
import { eq, and, asc } from "drizzle-orm";

export interface TransactionForRules {
  description: string;
  transactionType: string; // 'debit' | 'credit'
}

export class BankRulesService {
  /**
   * Evaluates active rules against a list of transactions.
   * Returns matching rule if found, otherwise null.
   */
  static async findMatchingRule(
    companyId: string,
    transaction: TransactionForRules
  ) {
    // Fetch all active rules for the company, sorted by priority (lowest first)
    const activeRules = await db
      .select()
      .from(bankRules)
      .where(and(eq(bankRules.companyId, companyId), eq(bankRules.isActive, true)))
      .orderBy(asc(bankRules.priority));

    for (const rule of activeRules) {
      // 1. Filter by direction if not 'any'
      if (
        rule.transactionDirection !== "any" &&
        rule.transactionDirection !== transaction.transactionType
      ) {
        continue;
      }

      // 2. Evaluate condition
      const desc = transaction.description.toLowerCase();
      const val = rule.conditionValue.toLowerCase();
      let matches = false;

      switch (rule.conditionType) {
        case "contains":
          matches = desc.includes(val);
          break;
        case "starts_with":
          matches = desc.startsWith(val);
          break;
        case "equals":
          matches = desc === val;
          break;
      }

      if (matches) {
        return rule;
      }
    }

    return null;
  }

  /**
   * CRUD: Get all rules for a company
   */
  static async getRules(companyId: string) {
    return db
      .select()
      .from(bankRules)
      .where(eq(bankRules.companyId, companyId))
      .orderBy(asc(bankRules.priority));
  }

  /**
   * CRUD: Create a new rule
   */
  static async createRule(data: typeof bankRules.$inferInsert) {
    const [rule] = await db.insert(bankRules).values(data).returning();
    return rule;
  }

  /**
   * CRUD: Update a rule
   */
  static async updateRule(id: string, data: Partial<typeof bankRules.$inferInsert>) {
    const [rule] = await db
      .update(bankRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(bankRules.id, id))
      .returning();
    return rule;
  }

  /**
   * CRUD: Delete a rule
   */
  static async deleteRule(id: string) {
    const [rule] = await db.delete(bankRules).where(eq(bankRules.id, id)).returning();
    return rule;
  }
}
