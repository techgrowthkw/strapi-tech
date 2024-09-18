'use strict';

// Helpers.
const { createAuthRequest } = require('api-tests/request');
const { createStrapiInstance, superAdmin } = require('api-tests/strapi');
const { createUtils } = require('api-tests/utils');

const internals = {
  role: null,
};

describe('Admin Auth Password History for Reset Password', () => {
  let rq;
  let strapi;
  let utils;

  beforeAll(async () => {
    strapi = await createStrapiInstance();
    rq = await createAuthRequest({ strapi });
    utils = createUtils(strapi);

    internals.role = await utils.createRole({
      name: 'auth_test_role',
      description: 'Only used for auth crud test (api)',
    });

    await strapi.db.query('admin::password-history').delete({
      where: {
        $not: null,
      },
    });
  });

  afterAll(async () => {
    await utils.deleteRolesById([internals.role.id]);

    await strapi.destroy();
  });

  test('Resetting password will save old password in history', async () => {
    const resetPasswordToken = 'abcdedfghijklmnopqrstuvwxyz';
    const user = rq.getLoggedUser();

    await strapi.db.query('admin::user').update({
      where: { id: user.id },
      data: {
        resetPasswordToken,
      },
    });
    // get password history
    const queryRes = await strapi.db.query('admin::password-history').findMany();
    expect(queryRes.length).toBe(0);

    const res = await rq({
      url: '/admin/reset-password',
      method: 'POST',
      body: {
        password: '@newPassword1234',
        resetPasswordToken,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
    // Check if the password is saved in the history table
    const queryResAfter = await strapi.db.query('admin::password-history').findMany();
    expect(queryResAfter.length).toBe(1);
  });
});
