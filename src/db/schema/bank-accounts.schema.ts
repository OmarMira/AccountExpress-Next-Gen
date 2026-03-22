import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { companies } from './system.schema';
import { chartOfAccounts } from './accounting.schema';

export const bankAccounts = sqliteTable('bank_accounts', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id),
  accountName: text('account_name').notNull(),
  bankName: text('bank_name').notNull(),
  accountNumber: text('account_number'),
  accountType: text('account_type').notNull().default('checking'),
  glAccountId: text('gl_account_id').references(() => chartOfAccounts.id),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
