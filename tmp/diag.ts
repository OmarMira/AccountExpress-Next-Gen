import { rawDb } from '../src/db/connection.ts';

// STEP 1: Check users in DB
console.log('--- DB USERS ---');
const users = rawDb.query('SELECT id, username, is_active FROM users').all();
console.log(JSON.stringify(users, null, 2));

// STEP 2: Check .env variables
console.log('\n--- ENV VARS ---');
console.log('ADMIN_USERNAME:', process.env.ADMIN_USERNAME);
console.log('ADMIN_PASSWORD defined:', !!process.env.ADMIN_PASSWORD);
