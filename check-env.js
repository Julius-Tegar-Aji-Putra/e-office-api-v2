import { config } from 'dotenv';

config({ path: '.env' });

console.log('Environment loaded');
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('DATABASE_URL type:', typeof process.env.DATABASE_URL);
console.log('DATABASE_URL length:', process.env.DATABASE_URL?.length);

// Check for hidden characters
const url = process.env.DATABASE_URL || '';
for (let i = 0; i < url.length; i++) {
  const char = url[i];
  const code = char.charCodeAt(0);
  if (code < 32 || code > 126) {
    console.log(`Hidden character at position ${i}: code ${code}`);
  }
}
