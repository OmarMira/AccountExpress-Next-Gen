import { deleteCompany } from '../src/services/companies.service.ts';

async function run() {
  try {
    const id = 'bcda3cc1-616f-4bbb-a00f-5058ccb33c36';
    console.log(`Attempting to delete company ${id} via service...`);
    await deleteCompany(id);
    console.log('Successfully deleted company via service.');
  } catch (err) {
    console.error('Service deletion failed:', err);
  }
  process.exit(0);
}

run();
