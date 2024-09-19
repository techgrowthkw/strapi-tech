import type { Context } from 'koa';
import type { AdminUser } from '../../../shared/contracts/shared';

import { getService } from '../utils';
import { validateProfileUpdateInput } from '../validation/user';
import { GetMe, GetOwnPermissions, UpdateMe } from '../../../shared/contracts/users';

export default {
  async getMe(ctx: Context) {
    const userInfo = getService('user').sanitizeUser(ctx.state.user as AdminUser);

    ctx.body = {
      data: userInfo,
    } satisfies GetMe.Response;
  },

  async updateMe(ctx: Context) {
    const input = ctx.request.body as UpdateMe.Request['body'];

    await validateProfileUpdateInput(input);

    const userService = getService('user');
    const authServer = getService('auth');

    const { currentPassword, ...userInfo } = input;

    let isValid = false;
    if (currentPassword && userInfo.password) {
      isValid = await authServer.validatePassword(currentPassword, ctx.state.user.password);

      if (!isValid) {
        // @ts-expect-error - refactor ctx bad request to take a second argument
        return ctx.badRequest('ValidationError', {
          currentPassword: ['Invalid credentials'],
        });
      }
      // apply password policies
      await authServer.applyPasswordPolicies(ctx.state.user, userInfo.password);
    }

    const updatedUser = await userService.updateById(ctx.state.user.id, userInfo);

    if (userInfo.password && isValid) {
      // save password history
      await authServer.updatePasswordHistory(updatedUser, userInfo.password);
    }

    ctx.body = {
      data: userService.sanitizeUser(updatedUser),
    } satisfies UpdateMe.Response;
  },

  async getOwnPermissions(ctx: Context) {
    const { findUserPermissions, sanitizePermission } = getService('permission');
    const { user } = ctx.state;

    const userPermissions = await findUserPermissions(user as AdminUser);

    ctx.body = {
      // @ts-expect-error - transform response type to sanitized permission
      data: userPermissions.map(sanitizePermission),
    } satisfies GetOwnPermissions.Response;
  },
};
