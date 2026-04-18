import { execSync } from 'child_process';

console.log('Testing auth hardening...');

const run = (env: string) => {
  try {
    return execSync(`${env} npx tsx -e "import('./src/lib/auth.ts')"`, { stdio: 'pipe' }).toString();
  } catch (error: any) {
    return error.stderr?.toString() || error.message;
  }
};

console.log('Case 1: NODE_ENV=production, NO SESSION_SECRET');
const res1 = run('NODE_ENV=production');
if (res1.includes('SESSION_SECRET environment variable is required in production')) {
  console.log('✅ PASS: Module threw SESSION_SECRET error as expected');
} else {
  console.log('❌ FAIL: Module did NOT throw SESSION_SECRET error as expected');
  console.log('Output:', res1);
}

console.log('\nCase 2: NODE_ENV=production, WITH SESSION_SECRET');
const res2 = run('NODE_ENV=production SESSION_SECRET=test-secret-at-least-32-chars-long-1234567890');
if (res2.includes('SESSION_SECRET environment variable is required in production')) {
  console.log('❌ FAIL: Module threw SESSION_SECRET error even with secret provided');
} else {
  console.log('✅ PASS: Module did NOT throw SESSION_SECRET error');
  // It might still throw other errors like "next/headers" not found or something, which is fine.
}
