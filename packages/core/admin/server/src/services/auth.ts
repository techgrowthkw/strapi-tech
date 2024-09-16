import bcrypt from 'bcryptjs';
import _ from 'lodash';
import { getAbsoluteAdminUrl, errors } from '@strapi/utils';
import { getService } from '../utils';
import type { AdminUser } from '../../../shared/contracts/shared';
import '@strapi/types';

const { ApplicationError } = errors;

/**
 * hashes a password
 * @param password - password to hash
 * @returns hashed password
 */
const hashPassword = (password: string) => bcrypt.hash(password, 10);

/**
 * Validate a password
 * @param password
 * @param hash
 * @returns {Promise<boolean>} is the password valid
 */
const validatePassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/**
 * Check login credentials
 * @param email the users email address
 * @param password the users password
 */
const checkCredentials = async ({ email, password }: { email: string; password: string }) => {
  const user: AdminUser = await strapi.query('admin::user').findOne({ where: { email } });

  if (!user || !user.password) {
    return [null, false, { message: 'Invalid credentials' }];
  }

  const isValid = await validatePassword(password, user.password);

  if (!isValid) {
    return [null, false, { message: 'Invalid credentials' }];
  }

  if (!(user.isActive === true)) {
    return [null, false, { message: 'User not active' }];
  }

  // if (user.OTP_code === null) {
  //   return [null, user, { message: 'OTP is Null' }];
  // }

  return [null, user];
};

/**
 * Send an email to the user if it exists or do nothing
 * @param email user email for which to reset the password
 */
const forgotPassword = async ({ email } = {} as { email: string }) => {
  const user: AdminUser = await strapi
    .query('admin::user')
    .findOne({ where: { email, isActive: true } });
  if (!user) {
    return;
  }

  const resetPasswordToken = getService('token').createToken();
  await getService('user').updateById(user.id, { resetPasswordToken });

  // Send an email to the admin.
  const url = `${getAbsoluteAdminUrl(
    strapi.config
  )}/auth/reset-password?code=${resetPasswordToken}`;

  return strapi
    .plugin('email')
    .service('email')
    .sendTemplatedEmail(
      {
        to: user.email,
        from: strapi.config.get('admin.forgotPassword.from'),
        replyTo: strapi.config.get('admin.forgotPassword.replyTo'),
      },
      strapi.config.get('admin.forgotPassword.emailTemplate'),
      {
        url,
        user: _.pick(user, ['email', 'firstname', 'lastname', 'username']),
      }
    )
    .catch((err: unknown) => {
      // log error server side but do not disclose it to the user to avoid leaking informations
      strapi.log.error(err);
    });
};

/**
 * Reset a user password
 * @param resetPasswordToken token generated to request a password reset
 * @param password new user password
 */
const resetPassword = async (
  { resetPasswordToken, password } = {} as { resetPasswordToken: string; password: string }
) => {
  const matchingUser: AdminUser | undefined = await strapi
    .query('admin::user')
    .findOne({ where: { resetPasswordToken, isActive: true } });

  if (!matchingUser) {
    throw new ApplicationError();
  }

  // new
  // Check if the new password matches any of the last 12 passwords
  const passwordHistory = await strapi.query('admin::password-history').findOne({ where: { user: matchingUser.id } });

  const newPasswordHash = await hashPassword(password);

  if (passwordHistory.length >= 12) {
    passwordHistory.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
    if (passwordHistory.some(history => validatePassword(password, history.passwordHash))) {
      throw new ApplicationError('Password cannot be the same as the last 12 passwords');
    }

    // Remove the oldest entry if there are more than 12 entries
    await strapi.query('admin::password-history').delete({ where: { id: passwordHistory[11].id } });
  }

    // Create a new entry in password history
    await strapi.query('admin::password-history').create({
      data: {
        user: matchingUser.id,
        passwordHash: newPasswordHash,
        changedAt: new Date(),
      },
    });
  // new

  return getService('user').updateById(matchingUser.id, {
    password,
    resetPasswordToken: null,
  });

  
};

/**
 * Change a user's password and keep track of the last 12 passwords
 * @param userId the ID of the user
 * @param newPassword the new password to set
 */
const changePassword = async (userId: string, newPassword: string) => {
  const user: AdminUser | null = await strapi.query('admin::user').findOne({ where: { id: userId } });

  if (!user) throw new ApplicationError('User not found');

  const newPasswordHash = await hashPassword(newPassword);

  // Check if the new password matches any of the last 12 passwords
  const passwordHistory = await strapi.query('admin::password-history').findOne({ where: { user: userId } });

  if (passwordHistory.length >= 12) {
    passwordHistory.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
    if (passwordHistory.some(history => validatePassword(newPassword, history.passwordHash))) {
      throw new ApplicationError('Password cannot be the same as the last 12 passwords');
    }

    // Remove the oldest entry if there are more than 12 entries
    await strapi.query('admin::password-history').delete({ where: { id: passwordHistory[11].id } });
  }

  // Save the new password
  await getService('user').updateById(userId, { password: newPasswordHash });

  // Create a new entry in password history
  await strapi.query('admin::password-history').create({
    data: {
      user: userId,
      passwordHash: newPasswordHash,
      changedAt: new Date(),
    },
  });
};

export default { checkCredentials, validatePassword, hashPassword,changePassword, forgotPassword, resetPassword };
