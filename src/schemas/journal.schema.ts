import { z } from "zod";

// ============================================================
// JOURNAL SCHEMAS — Input validation for journal routes
// Zod handles structural validation; double-entry math is done in the service.
// ============================================================

export const CreateJournalEntrySchema = z.object({
  companyId:   z.string().uuid("Invalid company ID"),
  entryDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  description: z.string().min(3, "Description too short").max(500, "Description too long"),
  reference:   z.string().max(100, "Reference too long").optional(),
  isAdjusting: z.boolean().optional().default(false),
  periodId:    z.string().uuid("Invalid period ID"),
  lines: z.array(z.object({
    accountId:    z.string().uuid("Invalid account ID"),
    debitAmount:  z.number().min(0, "Amount cannot be negative").max(999_999_999, "Amount too large"),
    creditAmount: z.number().min(0, "Amount cannot be negative").max(999_999_999, "Amount too large"),
    description:  z.string().max(200, "Line description too long").optional(),
    lineNumber:   z.number().int().min(1, "Invalid line number"),
  })).min(2, "A journal entry requires at least 2 lines for double-entry"),
}).refine(data => {
  // At least one debit and one credit line
  const hasDebit  = data.lines.some(l => l.debitAmount > 0);
  const hasCredit = data.lines.some(l => l.creditAmount > 0);
  return hasDebit && hasCredit;
}, {
  message: "El asiento debe tener al menos un débito y un crédito",
  path: ["lines"] // Put error on the lines array
});

export type CreateJournalEntryInput = z.infer<typeof CreateJournalEntrySchema>;

