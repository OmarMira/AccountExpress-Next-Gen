import { describe, it, expect, vi } from 'vitest';
import { computeEntryHash, getJournalChainTip, nextEntryNumber } from '../../src/services/journal-hash.service';

// Mock DB connection
vi.mock('../../src/db/connection.ts', () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => [])
          }))
        }))
      }))
    }))
  },
  sql: vi.fn()
}));

describe('journal-hash.service', () => {
  describe('computeEntryHash', () => {
    it('should be deterministic', async () => {
      const entryId = 'test-id';
      const entry = { companyId: 'comp-1', entryDate: '2026-05-05', description: 'Test Entry' };
      const lines = [
        { accountId: 'a', debitAmount: 100, creditAmount: 0, lineNumber: 1 },
        { accountId: 'b', debitAmount: 0, creditAmount: 100, lineNumber: 2 }
      ];
      const prevHash = 'PREV-HASH';

      const hash1 = await computeEntryHash(entryId, entry as any, lines as any, prevHash);
      const hash2 = await computeEntryHash(entryId, entry as any, lines as any, prevHash);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it('should change when description changes', async () => {
      const entryId = 'test-id';
      const entry1 = { companyId: 'comp-1', entryDate: '2026-05-05', description: 'Description A' };
      const entry2 = { companyId: 'comp-1', entryDate: '2026-05-05', description: 'Description B' };
      const lines = [{ accountId: 'a', debitAmount: 100, creditAmount: 0, lineNumber: 1 }];
      const prevHash = 'PREV-HASH';

      const hash1 = await computeEntryHash(entryId, entry1 as any, lines as any, prevHash);
      const hash2 = await computeEntryHash(entryId, entry2 as any, lines as any, prevHash);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getJournalChainTip', () => {
    it('should return GENESIS when no records exist', async () => {
      // Mock db returns empty array for the tip query
      const result = await getJournalChainTip('some-company');
      expect(result.hash).toBe('GENESIS');
    });
  });

  describe('nextEntryNumber', () => {
    it('should generate correct format JE-YYYY-XXXX', async () => {
      // Need to mock the db.execute result
      const { db } = await import('../../src/db/connection.ts');
      (db.execute as any).mockResolvedValueOnce([{ max_seq: 41 }]);

      const result = await nextEntryNumber('some-company');
      const year = new Date().getFullYear();
      expect(result).toBe(`JE-${year}-0042`);
    });
  });
});
