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
  // apply password policies
  await applyPasswordPolicies(matchingUser, password);

  const updatedUser = getService('user').updateById(matchingUser.id, {
    password,
    resetPasswordToken: null,
  });
  // save password history
  await updatePasswordHistory(matchingUser, password);

  return updatedUser;
};

/**
 * Update the password history
 * @param user the user for which to update the password history
 * @param password the new password
 * @returns {Promise<void>}
 */
const updatePasswordHistory = async (user: AdminUser, password: string): Promise<void> => {
  const passwordHistory = await getSortedPasswordHistory(user);

  if (passwordHistory.length > 0) {
    if (passwordHistory.length >= 12) {
      await strapi.query('admin::password-history').deleteMany({
        where: {
          id: { $in: passwordHistory.slice(11).map((entry) => entry.id) },
        },
      });
    }
  }

  const passwordHash = await hashPassword(password);
  // Create a new entry in password history
  await strapi.query('admin::password-history').create({
    data: {
      user: user,
      passwordHash: passwordHash,
    },
  });
};

/**
 * Apply password policies
 * @param password the password to apply the policies to
 * @returns {Promise<void>}
 */
const applyPasswordPolicies = async (user: AdminUser, password: string): Promise<void> => {
  // Check if the password is at least 15 characters long
  if (password.length < 15) {
    throw new ApplicationError('Password must be at least 15 characters long');
  }
  // Check if the password contains at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    throw new ApplicationError('Password must contain at least one uppercase letter');
  }
  // Check if the password contains at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    throw new ApplicationError('Password must contain at least one lowercase letter');
  }
  // Check if the password contains at least one number
  if (!/[0-9]/.test(password)) {
    throw new ApplicationError('Password must contain at least one number');
  }
  // Check if the password contains at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    throw new ApplicationError('Password must contain at least one special character');
  }
  const passwordHistory = await getSortedPasswordHistory(user);

  if (passwordHistory.length > 0) {
    // Check if password matches any of the last 12 passwords
    for (const entry of passwordHistory) {
      // For each entry in the password history, check if the new password matches
      if (await validatePassword(password, entry.passwordHash)) {
        throw new ApplicationError('You have used this password before');
      }
    }
    // Check if the latest password change was less than 24 hours ago
    if (
      new Date().getTime() - new Date(passwordHistory[0].changedAt).getTime() <
      24 * 60 * 60 * 1000
    ) {
      throw new ApplicationError('You cannot change your password more than once a day');
    }
  }
};

const getSortedPasswordHistory = async (user: AdminUser) => {
  const passwordHistory = await strapi
    .query('admin::password-history')
    .findMany({ where: { user: user.id } });

  if (passwordHistory.length > 0) {
    passwordHistory.sort(
      (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
    );
  }

  return passwordHistory;
};

export default {
  checkCredentials,
  validatePassword,
  hashPassword,
  forgotPassword,
  resetPassword,
  updatePasswordHistory,
  applyPasswordPolicies,
};
