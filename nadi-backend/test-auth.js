/**
 * Nadi Digital Service — Authentication Test Suite
 * 
 * Tests the full auth flow against the running backend server.
 * 
 * Usage:
 *   1. Start the backend: cd nadi-backend && node src/server.js
 *   2. Run tests:         node test-auth.js
 * 
 * All tests use the native fetch API (Node 18+).
 */

const API_BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: null, error: err.message };
  }
}

function assert(testName, condition, details) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    if (details) console.log(`     → ${typeof details === 'object' ? JSON.stringify(details, null, 2) : details}`);
    failed++;
  }
}

// ─────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────

const randomSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const testUser = {
  firstName: 'TestUser',
  lastName: 'Auth',
  email: `testauth_${randomSuffix}@example.com`,
  phone: `+234${Math.floor(7000000000 + Math.random() * 1000000000)}`,
  password: 'Test@1234Secure!',
};

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

async function runTests() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  Nadi Auth Test Suite');
  console.log(`  Target: ${API_BASE}`);
  console.log('═══════════════════════════════════════════════');
  console.log('');

  // ─── Health Check ──────────────────────────
  console.log('── Health Check ──');
  {
    const healthUrl = API_BASE.replace(/\/api\/v1\/?$/, '/health');
    const res = await fetch(healthUrl, { method: 'GET' });
    const status = res.status;
    const data = await res.json().catch(() => null);
    if (status === 0 || !data) {
      console.log(`  ❌ Server unreachable at ${API_BASE}`);
      console.log(`     → Network error or server not responding`);
      console.log('');
      console.log('  ⚠️  Make sure the backend is running: node src/server.js');
      process.exit(1);
    }
    assert('Server is reachable', status === 200, `status=${status}`);
  }
  console.log('');

  // ─── Test 1: Login with random credentials ─
  console.log('── Test 1: Login with random/invalid credentials ──');
  {
    const { status, data } = await request('POST', '/auth/login', {
      email: 'nonexistent_user_random@fake.com',
      password: 'RandomPassword123!',
    });
    assert('Returns 401 (not 200)', status === 401, `status=${status}`);
    assert('success is false', data?.success === false, data);
    assert('No token returned', !data?.token, data?.token ? 'token was returned!' : undefined);
  }
  console.log('');

  // ─── Test 2: Login with missing fields ─────
  console.log('── Test 2: Login with missing fields ──');
  {
    const { status, data } = await request('POST', '/auth/login', {
      email: '',
      password: '',
    });
    assert('Returns 400', status === 400, `status=${status}`);
    assert('Validation errors present', data?.errors?.length > 0 || data?.success === false, data);
  }
  console.log('');

  // ─── Test 3: Register with weak password ───
  console.log('── Test 3: Register with weak password ──');
  {
    const { status, data } = await request('POST', '/auth/register', {
      firstName: 'Test',
      lastName: 'User',
      email: 'weakpwd@test.com',
      phone: '+2348012345678',
      password: '123',
    });
    assert('Returns 400', status === 400, `status=${status}`);
    assert('Has validation errors', data?.errors?.length > 0 || data?.success === false, data);
  }
  console.log('');

  // ─── Test 4: Register with valid data ──────
  console.log('── Test 4: Register with valid data ──');
  let registeredToken = null;
  {
    const { status, data } = await request('POST', '/auth/register', testUser);
    assert('Returns 201', status === 201, `status=${status}, body=${JSON.stringify(data)}`);
    assert('success is true', data?.success === true, data);
    if (data?.token) {
      registeredToken = data.token;
      assert('Token returned', true);
    } else {
      assert('Token returned (may require login)', data?.message?.includes('login') || false, data?.message);
    }
  }
  console.log('');

  // ─── Test 5: Login with valid credentials ──
  console.log('── Test 5: Login with valid credentials ──');
  let validToken = null;
  {
    const { status, data } = await request('POST', '/auth/login', {
      email: testUser.email,
      password: testUser.password,
    });
    assert('Returns 200', status === 200, `status=${status}, body=${JSON.stringify(data)}`);
    assert('success is true', data?.success === true, data);
    assert('Token returned', !!data?.token, data?.token ? undefined : 'no token');
    assert('User object returned', !!data?.user, data?.user ? undefined : 'no user');
    assert('User email matches', data?.user?.email === testUser.email, data?.user?.email);
    validToken = data?.token || registeredToken;
  }
  console.log('');

  // ─── Test 6: Protected route without token ─
  console.log('── Test 6: Protected route without token ──');
  {
    const { status, data } = await request('GET', '/auth/profile');
    assert('Returns 401', status === 401, `status=${status}`);
    assert('Access denied message', data?.success === false, data);
  }
  console.log('');

  // ─── Test 7: Protected route with valid token
  console.log('── Test 7: Protected route with valid token ──');
  if (validToken) {
    const { status, data } = await request('GET', '/auth/profile', null, validToken);
    assert('Returns 200', status === 200, `status=${status}`);
    assert('success is true', data?.success === true, data);
    assert('User profile returned', !!data?.user, data?.user ? undefined : 'no user');
    assert('Email matches', data?.user?.email === testUser.email, data?.user?.email);
  } else {
    assert('Skipped — no valid token from login', false, 'Login did not return a token');
  }
  console.log('');

  // ─── Test 8: Protected route with garbage token
  console.log('── Test 8: Protected route with garbage token ──');
  {
    const { status, data } = await request('GET', '/auth/profile', null, 'garbage.invalid.token.here');
    assert('Returns 401', status === 401, `status=${status}`);
    assert('Access denied', data?.success === false, data);
  }
  console.log('');

  // ─── Test 9: Logout ────────────────────────
  console.log('── Test 9: Logout ──');
  if (validToken) {
    const { status, data } = await request('POST', '/auth/logout', {}, validToken);
    assert('Returns 200', status === 200, `status=${status}`);
    assert('success is true', data?.success === true, data);
  } else {
    assert('Skipped — no valid token', false, 'No token available');
  }
  console.log('');

  // ─── Test 10: Login after another random attempt ─
  console.log('── Test 10: Second random credentials attempt ──');
  {
    const { status, data } = await request('POST', '/auth/login', {
      email: 'another_random_user@doesnt.exist',
      password: 'AnotherRandom!1',
    });
    assert('Returns 401', status === 401, `status=${status}`);
    assert('No token returned', !data?.token, data?.token ? 'TOKEN LEAKED!' : undefined);
  }
  console.log('');

  // ─── Summary ───────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════');
  console.log('');

  if (failed > 0) {
    console.log('  ⚠️  Some tests failed. Review the output above.');
    process.exit(1);
  } else {
    console.log('  🎉 All tests passed!');
    process.exit(0);
  }
}

runTests();
