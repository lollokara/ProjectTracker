import { test, describe } from 'node:test';
import assert from 'node:assert';
import { NextResponse } from 'next/server';
import { applySecurityHeaders } from './middleware.ts';

describe('Middleware Hardening', () => {
  test('should inject required security headers', () => {
    const response = NextResponse.next();
    applySecurityHeaders(response);

    assert.strictEqual(response.headers.get('X-Frame-Options'), 'DENY');
    assert.strictEqual(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.strictEqual(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
    assert.ok(response.headers.get('Content-Security-Policy'));
    assert.strictEqual(response.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()');
  });

  test('should inject HSTS in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    const response = NextResponse.next();
    applySecurityHeaders(response);
    
    assert.ok(response.headers.get('Strict-Transport-Security'));
    
    process.env.NODE_ENV = originalEnv;
  });
});
