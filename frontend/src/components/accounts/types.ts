export interface Account {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
  parentId: string | null;
  level: number;
  isSystem: number;
  isActive: number;
  taxCategory?: string;
  description?: string;
}
