import 'dotenv/config';
import postgres from 'postgres';
import { createHash, randomBytes } from 'crypto';

/**
 * Bootstrap script: creates the first pairing token for initial device setup.
 * Run with: npx tsx packages/db/src/bootstrap.ts
 */
async function bootstrap() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const client = postgres(connectionString);

  // Generate a readable token
  const token = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');

  // Valid for 1 hour
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await client`
    INSERT INTO pairing_tokens (token_hash, expires_at)
    VALUES (${hash}, ${expiresAt})
  `;

  console.log('\n' + '═'.repeat(60));
  console.log('  PAIRING TOKEN GENERATED');
  console.log('═'.repeat(60));
  console.log('');
  console.log(`  Token:   ${token}`);
  console.log(`  Expires: ${expiresAt.toLocaleString()}`);
  console.log('');
  console.log('  Enter this token on your device to pair it.');
  console.log('═'.repeat(60) + '\n');

  await client.end();
}

bootstrap().catch((err) => {
  console.error('Bootstrap error:', err);
  process.exit(1);
});
