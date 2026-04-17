import { test, describe } from 'node:test';
import assert from 'node:assert';
import { rateLimit } from './rate-limit.ts';

describe('Rate Limiter', () => {
  test('should allow requests within limit', () => {
    const key = 'test-key-1';
    const limit = 5;
    const windowMs = 60000;

    for (let i = 0; i < limit; i++) {
      const result = rateLimit.check(key, limit, windowMs);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.remaining, limit - (i + 1));
    }
  });

  test('should block requests exceeding limit', () => {
    const key = 'test-key-2';
    const limit = 2;
    const windowMs = 60000;

    // First two should succeed
    rateLimit.check(key, limit, windowMs);
    rateLimit.check(key, limit, windowMs);

    // Third should fail
    const result = rateLimit.check(key, limit, windowMs);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.remaining, 0);
  });

  test('should reset after window expires', async () => {
    const key = 'test-key-3';
    const limit = 1;
    const windowMs = 100; // 100ms window

    // First should succeed
    assert.strictEqual(rateLimit.check(key, limit, windowMs).success, true);
    
    // Second should fail immediately
    assert.strictEqual(rateLimit.check(key, limit, windowMs).success, false);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, windowMs + 10));

    // Should succeed again
    assert.strictEqual(rateLimit.check(key, limit, windowMs).success, true);
  });
});
