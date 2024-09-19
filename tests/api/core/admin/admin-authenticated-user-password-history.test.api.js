'use strict';

// Helpers.
const { createStrapiInstance, superAdmin } = require('api-tests/strapi');
const { createAuthRequest } = require('api-tests/request');

describe('Authenticated User Password History', () => {
  let rq;
  let strapi;

  beforeAll(async () => {
    strapi = await createStrapiInstance();
    rq = await createAuthRequest({ strapi });
  });

  afterAll(async () => {
    await strapi.destroy();
    jest.useRealTimers();
  });
  beforeEach(async () => {
    await strapi.db.query('admin::password-history').delete({
      where: {
        $not: null,
      },
    });
  });

  test('Updating password will save current password in history', async () => {
    // get password history
    const queryRes = await strapi.db.query('admin::password-history').findMany();
    expect(queryRes.length).toBe(0);
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

    // Check if the password is saved in the history table
    const queryResAfter = await strapi.db.query('admin::password-history').findMany();

    expect(queryResAfter.length).toBe(1);
  });

  test('Password history is limited to 12 entries', async () => {
    jest.useFakeTimers();
    // get password history
    const queryRes = await strapi.db.query('admin::password-history').findMany();
    expect(queryRes.length).toBe(0);
    // update the password to a current one we know
    const firstPassword = '@newPasswordUpTo1512121';
    const hashedPassword = await strapi.admin.services.auth.hashPassword(firstPassword);
    const user = rq.getLoggedUser();
    await strapi.query('admin::user').update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    });

    for (let i = 0; i < 14; i++) {
      jest.advanceTimersByTime(24 * 60 * 60 * 1000); // todo: configure fake timers properly

      const input = {
        email: superAdmin.credentials.email,
        firstname: superAdmin.credentials.firstname,
        lastname: superAdmin.credentials.lastname,
        password: `@newPasswordUpTo15${i}`,
        currentPassword: i === 0 ? firstPassword : `@newPasswordUpTo15${i - 1}`,
      };
      const res = await rq({
        url: '/admin/users/me',
        method: 'PUT',
        body: input,
      });
      expect(res.statusCode).toBe(200);
    }
    // Check if the password is saved in the history table
    const queryResAfter = await strapi.db.query('admin::password-history').findMany();

    expect(queryResAfter.length).toBe(12);
  });
});
