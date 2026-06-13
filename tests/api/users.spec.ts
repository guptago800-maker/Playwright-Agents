/**
 * tests/api/users.spec.ts
 * API contract tests using reqres.in
 */

import { test, expect } from '@playwright/test';

const BASE = 'https://reqres.in/api';

test.describe('Users API', () => {
  test('GET /users returns paginated list', async ({ request }) => {
    const response = await request.get(`${BASE}/users?page=1`);

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      page: 1,
      per_page: expect.any(Number),
      total: expect.any(Number),
      data: expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(Number),
          email: expect.stringContaining('@'),
          first_name: expect.any(String),
          last_name: expect.any(String),
        }),
      ]),
    });
  });

  test('GET /users/:id returns single user', async ({ request }) => {
    const response = await request.get(`${BASE}/users/2`);

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data).toMatchObject({
      id: 2,
      email: expect.stringContaining('@'),
    });
  });

  test('GET /users/:id returns 404 for non-existent user', async ({ request }) => {
    const response = await request.get(`${BASE}/users/9999`);
    expect(response.status()).toBe(404);
  });

  test('POST /users creates a new user', async ({ request }) => {
    const payload = { name: 'QA Engineer', job: 'Automation' };
    const response = await request.post(`${BASE}/users`, { data: payload });

    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body).toMatchObject({
      name: payload.name,
      job: payload.job,
      id: expect.any(String),
      createdAt: expect.any(String),
    });
  });

  test('PUT /users/:id updates a user', async ({ request }) => {
    const payload = { name: 'Updated QA', job: 'Lead Automation' };
    const response = await request.put(`${BASE}/users/2`, { data: payload });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      name: payload.name,
      updatedAt: expect.any(String),
    });
  });

  test('DELETE /users/:id returns 204', async ({ request }) => {
    const response = await request.delete(`${BASE}/users/2`);
    expect(response.status()).toBe(204);
  });

  test('POST /login returns token for valid credentials', async ({ request }) => {
    const response = await request.post(`${BASE}/login`, {
      data: { email: 'eve.holt@reqres.in', password: 'cityslicka' },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('token');
    expect(typeof body.token).toBe('string');
  });

  test('POST /login returns 400 for missing password', async ({ request }) => {
    const response = await request.post(`${BASE}/login`, {
      data: { email: 'eve.holt@reqres.in' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });
});
