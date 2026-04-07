// ============================================================
// JOURNAL TYPES — Shared interfaces for the journal subsystem.
// Single source of truth for JournalEntryInput and JournalLineInput.
// ============================================================

export interface JournalLineInput {
  accountId:    string;
  debitAmount:  number;
  creditAmount: number;
  description:  string | null;
  lineNumber:   number;
}

export interface JournalEntryInput {
  companyId:   string;
  entryDate:   string;
  description: string;
  reference:   string | null;
  isAdjusting: boolean;
  periodId:    string;
  createdBy:   string;
}
