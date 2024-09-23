/* eslint-disable @typescript-eslint/no-non-null-assertion */
import _ from 'lodash';
import { defaults } from 'lodash/fp';
import { stringIncludes, errors } from '@strapi/utils';
import { Entity } from '@strapi/types';
import { createUser, hasSuperAdminRole } from '../domain/user';
import axios, { AxiosResponse, AxiosError } from 'axios';
import type {
  AdminUser,
  AdminRole,
  AdminUserCreationPayload,
  SanitizedAdminUser,
  SanitizedAdminRole,
  AdminUserUpdatePayload,
  // eslint-disable-next-line node/no-unpublished-import
} from '../../../shared/contracts/shared';
import { password as passwordValidator } from '../validation/common-validators';
import { getService } from '../utils';
import constants from './constants';
import dotenv from 'dotenv';
const { SUPER_ADMIN_CODE } = constants;

const { ValidationError } = errors;
const sanitizeUserRoles = (role: AdminRole): SanitizedAdminRole =>
  _.pick(role, ['id', 'name', 'description', 'code']);

/**
 * Remove private user fields
 * @param  user - user to sanitize
 */
const sanitizeUser = (user: AdminUser): SanitizedAdminUser => {
  return {
    ..._.omit(user, ['password', 'resetPasswordToken', 'registrationToken', 'roles']),
    roles: user.roles && user.roles.map(sanitizeUserRoles),
  };
};
dotenv.config();
/**
 * Create and save a user in database
 * @param attributes A partial user object
 */
const create = async (
  // isActive is added in the controller, it's not sent by the API.
  attributes: Partial<AdminUserCreationPayload> & { isActive?: true } & {isVerified?: false} & {otp?: string}
): Promise<AdminUser> => {
  const userInfo = {
    registrationToken: getService('token').createToken(),
    ...attributes,
  };

  if (_.has(attributes, 'password')) {
    userInfo.password = await getService('auth').hashPassword(attributes.password!);
  }

  const user = createUser(userInfo);

  const createdUser = await strapi.query('admin::user').create({ data: user, populate: ['roles'] });

  getService('metrics').sendDidInviteUser();

  strapi.eventHub.emit('user.create', { user: sanitizeUser(createdUser) });

  return createdUser;
};

const sendSms = (otp: string,phone: string | undefined) =>{
  // console.log("otp", otp,phone)
  if (phone != undefined || phone != '') {
  
    const postData = {
      username: process.env.SMS_USERNAME,
      password: process.env.SMS_PASSWORD,
      sender: process.env.SMS_SENDER,
      mobile: phone,
      lang: '1',
      test: '0',
      message: `Your otp code ${otp}`
    };

    const url = process.env.SMS_API_URL
    console.log("otp", otp)
    // axios.post(`${url}/API/send/`, postData)
    //   .then(response => {
    //     // Handle success
    //     console.log('Response data:', response.data);
    //   })
    //   .catch(error => {
    //     // Handle error
    //     console.error('Error sending SMS:', error.message);
    //   });
  }else{
    throw new ValidationError('no phone number exist for this user');
  }

 
 
}

/**
 * Update a user in database
 * @param id query params to find the user to update
 * @param attributes A partial user object
 */
const updateById = async (
  id: Entity.ID,
  attributes: Partial<AdminUserUpdatePayload>
): Promise<AdminUser> => {
  // Check at least one super admin remains
  if (_.has(attributes, 'roles')) {
    const lastAdminUser = await isLastSuperAdminUser(id);
    const superAdminRole = await getService('role').getSuperAdminWithUsersCount();
    const willRemoveSuperAdminRole = !stringIncludes(attributes.roles!, superAdminRole.id);

    if (lastAdminUser && willRemoveSuperAdminRole) {
      throw new ValidationError('You must have at least one user with super admin role.');
    }
  }

  // cannot disable last super admin
  if (attributes.isActive === false) {
    const lastAdminUser = await isLastSuperAdminUser(id);
    if (lastAdminUser) {
      throw new ValidationError('You must have at least one user with super admin role.');
    }
  }
 
  // hash password if a new one is sent
  if (_.has(attributes, 'password')) {
    const hashedPassword = await getService('auth').hashPassword(attributes.password!);

    const updatedUser = await strapi.query('admin::user').update({
      where: { id },
      data: {
        ...attributes,
        password: hashedPassword,
      },
      populate: ['roles'],
    });

    strapi.eventHub.emit('user.update', { user: sanitizeUser(updatedUser) });

    return updatedUser;
  }

  const updatedUser = await strapi.query('admin::user').update({
    where: { id },
    data: attributes,
    populate: ['roles'],
  });

  if (updatedUser) {
    strapi.eventHub.emit('user.update', { user: sanitizeUser(updatedUser) });
  }

  return updatedUser;
};

/**
 * Update a user in database
 * @param id query params to find the user to update

 */
const updateUserVerification = async (
  id: Entity.ID) => {
 

  const updatedUser = await strapi.query('admin::user').update({
    where: { id },
    data: { isVerified: true },
  
  });

  if (updatedUser) {
    strapi.eventHub.emit('user.update', { user: sanitizeUser(updatedUser) });
  }

  return updatedUser;
};



const disableUserVerification = async (
  id: Entity.ID) => {
 

  const updatedUser = await strapi.query('admin::user').update({
    where: { id },
    data: { isVerified: false },
  
  });

  if (updatedUser) {
    strapi.eventHub.emit('user.update', { user: sanitizeUser(updatedUser) });
  }

  return updatedUser;
};

/**
 * Update a user in database
 * @param id query params to find the user to update

 */
const generateNewOtp = async (
  id: Entity.ID) => {
    const otp =   getService('token').generateRadomNumber()
   
  const updatedUser = await strapi.query('admin::user').update({
    where: { id },
    data: { otp: otp },
  
  });

  // if (updatedUser) {
  //   strapi.eventHub.emit('user.update', { user: sanitizeUser(updatedUser) });
  // }

  return updatedUser;
};

/**
 * Reset a user password by email. (Used in admin:reset CLI)
 * @param email - user email
 * @param password - new password
 */
const resetPasswordByEmail = async (email: string, password: string) => {
  const user = await strapi.query('admin::user').findOne({ where: { email }, populate: ['roles'] });

  if (!user) {
    throw new Error(`User not found for email: ${email}`);
  }

  try {
    await passwordValidator.validate(password);
  } catch (error) {
    throw new ValidationError(
      'Invalid password. Expected a minimum of 8 characters with at least one number and one uppercase letter'
    );
  }

  await updateById(user.id, { password });
};


/**
 * Reset a user password by email. (Used in admin:reset CLI)
 * @param email - user email
 * @param password - new password
 */
// const createOtpRecord = async (id: Entity.ID) => {
//    await strapi.query('admin::otp').create({
//     data: {
//       // createdAt: new Date(),
//       user: id, // Reference to the admin_user ID
//       otp:123
//     }
//   });
// };

/**
 * Check if a user is the last super admin
 * @param userId user's id to look for
 */
const isLastSuperAdminUser = async (userId: Entity.ID): Promise<boolean> => {
  const user = (await findOne(userId)) as AdminUser | null;
  if (!user) return false;

  const superAdminRole = await getService('role').getSuperAdminWithUsersCount();

  return superAdminRole.usersCount === 1 && hasSuperAdminRole(user);
};

/**
 * Check if a user with specific attributes exists in the database
 * @param attributes A partial user object
 */
const exists = async (attributes = {} as unknown): Promise<boolean> => {
  return (await strapi.query('admin::user').count({ where: attributes })) > 0;
};

/**
 * Returns a user registration info
 * @param registrationToken - a user registration token
 * @returns - Returns user email, firstname and lastname
 */
const findRegistrationInfo = async (
  registrationToken: string
): Promise<Pick<AdminUser, 'email' | 'firstname' | 'lastname'> | undefined> => {
  const user = await strapi.query('admin::user').findOne({ where: { registrationToken } });

  if (!user) {
    return undefined;
  }

  return _.pick(user, ['email','phoneNumber', 'firstname', 'lastname']);
};

/**
 * Registers a user based on a registrationToken and some informations to update
 * @param params
 * @param params.registrationToken registration token
 * @param params.userInfo user info
 */
const register = async ({
  registrationToken,
  userInfo,
}: {
  registrationToken: string;
  userInfo: Partial<AdminUser>;
}) => {
  const matchingUser = await strapi.query('admin::user').findOne({ where: { registrationToken } });

  if (!matchingUser) {
    throw new ValidationError('Invalid registration info');
  }

 
  const otp =   getService('token').generateRadomNumber()
  return getService('user').updateById(matchingUser.id, {
    password: userInfo.password,
    firstname: userInfo.firstname,
    lastname: userInfo.lastname,
    registrationToken: null,
    isActive: true,
    otp: otp,
    // isActive: true,

  });
};

/**
 * Find one user
 */
const findOne = async (id: Entity.ID, populate = ['roles']) => {
  // @ts-ignore - Migrate id type to StrapiID
  return strapi.entityService.findOne('admin::user', id, { populate });
};

/**
 * Find one user by its email
 * @param email
 * @param populate
 * @returns
 */
const findOneByEmail = async (email: string, populate = []) => {
  return strapi.query('admin::user').findOne({
    where: { email: { $eqi: email } },
    populate,
  });
};

/**
 * Find one user by its email
 * @param token
 * @param populate
 * @returns
 */
const findOneByToken = async (token: string, populate = []) => {
  const { isValid, payload } = getService('token').decodeJwtToken(token);

  if (!isValid) {
    throw new ValidationError('Invalid token');
  }
  return strapi.query('admin::user').findOne({
    where: { id: { $eqi: payload.id } },
    populate,
  });
};

/** Find many users (paginated)
 * @param query
 */
// TODO: TS - type find Page. At the moment, 'admin::user'is not being resolved by the ES type registry
const findPage = async (query = {}): Promise<unknown> => {
  const enrichedQuery = defaults({ populate: ['roles'] }, query);
  return strapi.entityService.findPage('admin::user', enrichedQuery);
};

/** Delete a user
 * @param id id of the user to delete
 */
const deleteById = async (id: Entity.ID): Promise<AdminUser | null> => {
  // Check at least one super admin remains
  const userToDelete = (await strapi.query('admin::user').findOne({
    where: { id },
    populate: ['roles'],
  })) as AdminUser | null;

  if (!userToDelete) {
    return null;
  }

  if (userToDelete) {
    if (userToDelete.roles.some((r) => r.code === SUPER_ADMIN_CODE)) {
      const superAdminRole = await getService('role').getSuperAdminWithUsersCount();
      if (superAdminRole.usersCount === 1) {
        throw new ValidationError('You must have at least one user with super admin role.');
      }
    }
  }

  const deletedUser = await strapi
    .query('admin::user')
    .delete({ where: { id }, populate: ['roles'] });

  strapi.eventHub.emit('user.delete', { user: sanitizeUser(deletedUser) });

  return deletedUser;
};

/** Delete a user
 * @param ids ids of the users to delete
 */
const deleteByIds = async (ids: (string | number)[]): Promise<AdminUser[]> => {
  // Check at least one super admin remains
  const superAdminRole = await getService('role').getSuperAdminWithUsersCount();
  const nbOfSuperAdminToDelete = await strapi.query('admin::user').count({
    where: {
      id: ids,
      roles: { id: superAdminRole.id },
    },
  });

  if (superAdminRole.usersCount === nbOfSuperAdminToDelete) {
    throw new ValidationError('You must have at least one user with super admin role.');
  }

  const deletedUsers = [] as AdminUser[];
  for (const id of ids) {
    const deletedUser = await strapi.query('admin::user').delete({
      where: { id },
      populate: ['roles'],
    });

    deletedUsers.push(deletedUser);
  }

  strapi.eventHub.emit('user.delete', {
    users: deletedUsers.map((deletedUser) => sanitizeUser(deletedUser)),
  });

  return deletedUsers;
};

/** Count the users that don't have any associated roles
 */
const countUsersWithoutRole = async (): Promise<number> => {
  return strapi.query('admin::user').count({
    where: {
      roles: {
        id: { $null: true },
      },
    },
  });
};

/**
 * Count the number of users based on search params
 * @param params params used for the query
 */
const count = async (where = {}): Promise<number> => {
  return strapi.query('admin::user').count({ where });
};

/**
 * Assign some roles to several users
 */
const assignARoleToAll = async (roleId: Entity.ID): Promise<void> => {
  const users = await strapi.query('admin::user').findMany({
    select: ['id'],
    where: {
      roles: { id: { $null: true } },
    },
  });

  await Promise.all(
    users.map((user) => {
      return strapi.query('admin::user').update({
        where: { id: user.id },
        data: { roles: [roleId] },
      });
    })
  );
};

/** Display a warning if some users don't have at least one role
 */
const displayWarningIfUsersDontHaveRole = async (): Promise<void> => {
  const count = await countUsersWithoutRole();

  if (count > 0) {
    strapi.log.warn(`Some users (${count}) don't have any role.`);
  }
};

/** Returns an array of interface languages currently used by users
 */
const getLanguagesInUse = async (): Promise<string[]> => {
  const users = await strapi.query('admin::user').findMany({ select: ['preferedLanguage'] });

  return users.map((user) => user.preferedLanguage || 'en');
};

export default {
  create,
  updateById,
  exists,
  findRegistrationInfo,
  register,
  sanitizeUser,
  findOne,
  findOneByEmail,
  findPage,
  deleteById,
  deleteByIds,
  countUsersWithoutRole,
  count,
  assignARoleToAll,
  displayWarningIfUsersDontHaveRole,
  resetPasswordByEmail,
  getLanguagesInUse,
  isLastSuperAdminUser,
  findOneByToken,
  updateUserVerification,
  generateNewOtp,
  disableUserVerification,
  sendSms
  // createOtpRecord
};
