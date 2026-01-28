import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env' });

console.log('DATABASE_URL:', process.env.DATABASE_URL);

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Connection error:', err.message);
    console.error('Stack:', err.stack);
  } else {
    console.log('Connection successful!');
    console.log('Server time:', res.rows[0].now);
  }
  pool.end();
});
