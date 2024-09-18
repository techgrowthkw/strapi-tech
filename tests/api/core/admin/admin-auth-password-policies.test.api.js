'use strict';

// Helpers.
const { createStrapiInstance, superAdmin } = require('api-tests/strapi');
const { createAuthRequest } = require('api-tests/request');
const { createTestBuilder } = require('api-tests/builder');

const builder = createTestBuilder();

describe('Authenticated User Password Policies', () => {
  let rq;
  let strapi;

  beforeAll(async () => {
    strapi = await createStrapiInstance();
    rq = await createAuthRequest({ strapi });
  });

  afterAll(async () => {
    await strapi.destroy();
    await builder.cleanup();
  });
  beforeEach(async () => {
    await strapi.db.query('admin::password-history').delete({
      where: {
        $not: null,
      },
    });
  });
  test('Using a password with a number and a special character will update the password', async () => {
    // update the password to a current one we know
    const hashedPassword = await strapi.admin.services.auth.hashPassword(
      superAdmin.credentials.password
    );
    const user = rq.getLoggedUser();
    await strapi.query('admin::user').update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    });
    const input = {
      email: superAdmin.credentials.email,
      firstname: superAdmin.credentials.firstname,
      lastname: superAdmin.credentials.lastname,
      password: '@newPassword1234',
      currentPassword: superAdmin.credentials.password,
    };
    const res = await rq({
      url: '/admin/users/me',
      method: 'PUT',
      body: input,
    });
    expect(res.statusCode).toBe(200);

    const oldPasswordLoginRes = await rq({
      url: '/admin/login',
      method: 'POST',
      body: {
        email: superAdmin.credentials.email,
        password: superAdmin.credentials.password,
      },
    });
    expect(oldPasswordLoginRes.statusCode).toBe(400);

    const loginRes = await rq({
      url: '/admin/login',
      method: 'POST',
      body: {
        email: superAdmin.credentials.email,
        password: '@newPassword1234',
      },
    });
    expect(loginRes.statusCode).toBe(200);
  });

  test('Using a password less than 12 characters will throw an error', async () => {
    const input = {
      email: superAdmin.credentials.email,
      firstname: superAdmin.credentials.firstname,
      lastname: superAdmin.credentials.lastname,
      password: '1234567890',
      currentPassword: superAdmin.credentials.password,
    };
    const res = await rq({
      url: '/admin/users/me',
      method: 'PUT',
      body: input,
    });
    expect(res.statusCode).toBe(400);
  });

  test('Using a password without a number will throw an error', async () => {
    const input = {
      email: superAdmin.credentials.email,
      firstname: superAdmin.credentials.firstname,
      lastname: superAdmin.credentials.lastname,
      password: 'password',
      currentPassword: superAdmin.credentials.password,
    };
    const res = await rq({
      url: '/admin/users/me',
      method: 'PUT',
      body: input,
    });
    expect(res.statusCode).toBe(400);
  });

  test('Using a password without a special character will throw an error', async () => {
    const input = {
      email: superAdmin.credentials.email,
      firstname: superAdmin.credentials.firstname,
      lastname: superAdmin.credentials.lastname,
      password: 'password1234',
      currentPassword: superAdmin.credentials.password,
    };
    const res = await rq({
      url: '/admin/users/me',
      method: 'PUT',
      body: input,
    });
    expect(res.statusCode).toBe(400);
  });
});
