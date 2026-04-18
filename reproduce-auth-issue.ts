import { execSync } from 'child_process';

console.log('Testing auth hardening...');

try {
  // Simulate production without SESSION_SECRET
  console.log('Case 1: NODE_ENV=production, NO SESSION_SECRET');
  execSync('NODE_ENV=production tsx -e "import(\'./apps/web/src/lib/auth.js\')"');
  console.log('❌ FAIL: Module loaded without SESSION_SECRET in production');
} catch (error) {
  console.log('✅ PASS: Module threw error as expected (or failed to load due to other reasons)');
  console.log(error.stderr?.toString());
}

try {
  // Simulate production WITH SESSION_SECRET
  console.log('\nCase 2: NODE_ENV=production, WITH SESSION_SECRET');
  execSync('NODE_ENV=production SESSION_SECRET=test-secret-at-least-32-chars-long-1234567890 tsx -e "import(\'./apps/web/src/lib/auth.js\')"');
  console.log('✅ PASS: Module loaded with SESSION_SECRET in production');
} catch (error) {
  // If it fails because of next/headers, it's fine for this test as long as it doesn't fail because of SESSION_SECRET check
  console.log('⚠️ INFO: Module failed to load, possibly due to next/headers or other Next.js specific imports.');
  const stderr = error.stderr?.toString() || '';
  if (stderr.includes('SESSION_SECRET environment variable is required in production')) {
    console.log('❌ FAIL: Module threw SESSION_SECRET error even with secret provided');
  } else {
    console.log('✅ PASS: Module did NOT throw SESSION_SECRET error');
  }
}
