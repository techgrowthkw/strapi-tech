import type { Context, Next } from 'koa';
import passport from 'koa-passport';
import compose from 'koa-compose';
import '@strapi/types';
import { errors } from '@strapi/utils';
import { getService } from '../utils';
import {
  validateRegistrationInput,
  validateAdminRegistrationInput,
  validateRegistrationInfoQuery,
  validateForgotPasswordInput,
  validateResetPasswordInput,
  validateRenewTokenInput,
} from '../validation/authentication';

import type { 
  ForgotPassword,
  Login,
  Register,
  RegistrationInfo,
  RenewToken,
  ResetPassword,
  verifyOtp,
  resendOtp
} from '../../../shared/contracts/authentication';
import { AdminUser } from '../../../shared/contracts/shared';

const { ApplicationError, ValidationError } = errors;

export default {
  login: compose([
    (ctx: Context, next: Next) => {
      return passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err) {
          strapi.eventHub.emit('admin.auth.error', { error: err, provider: 'local' });
          // if this is a recognized error, allow it to bubble up to user
          if (err.details?.code === 'LOGIN_NOT_ALLOWED') {
            throw err;
          }

          // for all other errors throw a generic error to prevent leaking info
          return ctx.notImplemented();
        }

        if (!user) {
          strapi.eventHub.emit('admin.auth.error', {
            error: new Error(info.message),
            provider: 'local',
          });
          throw new ApplicationError(info.message);
        }

        const query = ctx.state as Login.Request['query'];
        query.user = user;

        const sanitizedUser = getService('user').sanitizeUser(user);
        strapi.eventHub.emit('admin.auth.success', { user: sanitizedUser, provider: 'local' });

        return next();
      })(ctx, next);
    }, 
   async (ctx: Context) => {
      const { user } = ctx.state as { user: AdminUser };
      // if(user.otp === null){
      //   ctx.body = {
      //     data: {
      //       token: null,
      //       user: getService('user').sanitizeUser(ctx.state.user), // TODO: fetch more detailed info
      //     },
      //   } satisfies Login.Response;
      // }else{
      //   ctx.body = {
      //     data: {
      //       token: getService('token').createJwtToken(user),
      //       user: getService('user').sanitizeUser(ctx.state.user), // TODO: fetch more detailed info
      //     },
      //   } satisfies Login.Response;
      // }
      let tokeninfo = null
      // let adminUser = strapi.db.query("admin::user").findOne({
      //   select: [],
      //   where: { id: user.id},
      //   orderBy: {},
      //   populate: {}
      // });
      const isSuperAdmin = await getService('user').isLastSuperAdminUser(user.id)
   
      if(isSuperAdmin === true ||  user.isVerified){
        tokeninfo = getService('token').createJwtToken(user) 
      }
      
      
      ctx.body = {
            data: {
              token: tokeninfo ,
              tokenTemp: !user.isVerified? getService('token').createJwtToken(user) : null,
              user: getService('user').sanitizeUser(ctx.state.user), // TODO: fetch more detailed info
            },
          } satisfies Login.Response;
    },
  ]),

  async renewToken(ctx: Context) {
    await validateRenewTokenInput(ctx.request.body);

    const { token } = ctx.request.body as RenewToken.Request['body'];

    const { isValid, payload } = getService('token').decodeJwtToken(token);

    if (!isValid) {
      throw new ValidationError('Invalid token');
    }

    ctx.body = {
      data: {
        token: getService('token').createJwtToken({ id: payload.id }),
      },
    } satisfies RenewToken.Response;
  },

  async registrationInfo(ctx: Context) {
    await validateRegistrationInfoQuery(ctx.request.query);

    const { registrationToken } = ctx.request.query as RegistrationInfo.Request['query'];

    const registrationInfo = await getService('user').findRegistrationInfo(registrationToken);

    if (!registrationInfo) {
      throw new ValidationError('Invalid registrationToken');
    }

    ctx.body = { data: registrationInfo } satisfies RegistrationInfo.Response;
  },

  async register(ctx: Context) {
    const input = ctx.request.body as Register.Request['body'];

    await validateRegistrationInput(input);

    const user = await getService('user').register(input);

    // send email here
    ctx.body = {
      data: {
        // token:  getService('token').createJwtToken(user),
        token: user.isVerified? getService('token').createJwtToken(user) :  null,
        tokenTemp: !user.isVerified? getService('token').createJwtToken(user) : null,
        user: getService('user').sanitizeUser(user),
      
      },
    } satisfies Register.Response;
  },

  async registerAdmin(ctx: Context) {
    const input = ctx.request.body as Register.Request['body'];

    await validateAdminRegistrationInput(input);

    const hasAdmin = await getService('user').exists();

    if (hasAdmin) {
      throw new ApplicationError('You cannot register a new super admin');
    }

    const superAdminRole = await getService('role').getSuperAdmin();

    if (!superAdminRole) {
      throw new ApplicationError(
        "Cannot register the first admin because the super admin role doesn't exist."
      );
    }

    const user = await getService('user').create({
      ...input,
      registrationToken: null,
      isActive: true,
      isVerified:false,
      otp: '123',
      roles: superAdminRole ? [superAdminRole.id] : [],
    }); 

    // const createdRecord =  await ;

    strapi.telemetry.send('didCreateFirstAdmin');

    ctx.body = {
      data: {
        token: getService('token').createJwtToken(user),
        user: getService('user').sanitizeUser(user),
        // record: getService('user').createOtpRecord(user.id)
      },
    };
    // ctx.body = {
    //   data: {
    //     token: null,
    //     user: getService('user').sanitizeUser(user),
    //     record: createdRecord
    //   },
    // };

  },

  async verifyOtp(ctx: Context){
    try {
      const input = ctx.request.body as verifyOtp.Request['body'];
  
      // Find user by tempToken
      const user = await getService('user').findOneByToken(input.tempToken);
  
      if (!user) {
        throw new ValidationError('Invalid tempToken');
      }
  
      // Check if the OTP matches
      if (input.code === user.otp) {
        await getService('user').updateUserVerification(user.id);
  
        const sanitizedUser = getService('user').sanitizeUser(user);
        // const token = getService('token').createJwtToken(user);
        const token = input.tempToken
  
        ctx.body = {
          data: {
            token,
            user: sanitizedUser,
          },
        } as verifyOtp.Response;
      } else {
        throw new ValidationError('Invalid OTP');
      }
  
    } catch (error) {
      // Handle potential errors
      ctx.throw(400, error.message || 'OTP verification failed');
    }
   
   
  },

  async resendOtp(ctx: Context){
    try {
      const input = ctx.request.body as resendOtp.Request['body'];
  
      // Find user by tempToken
      const user = await getService('user').findOneByToken(input.tempToken);
  
      if (!user) {
        throw new ValidationError('Invalid tempToken');
      }
  
     //generate new otp
      const updateduser = await getService('user').generateNewOtp(user.id);
      if (input.isEmail) {
        console.log("email", updateduser.otp)
        strapi
          .plugin('email')
          .service('email')
          .sendTemplatedEmail(
            {
              to: updateduser.email,
              from: strapi.config.get('admin.forgotPassword.from'),
              replyTo: strapi.config.get('admin.forgotPassword.replyTo'),
            },
            {
              subject: 'Your OTP Code', // Email subject
              text: 'Hello, your OTP code is: <%= otp %>', // Plain text body
              html: `
                <h1>Hi <%= userName %>,</h1>
                <p>Your OTP code is: <strong><%= otp %></strong></p>
              `, // HTML body
            },
            {
              userName: updateduser.username, // Pass data to the template
              otp: updateduser.otp,
            }
          )
          .catch((err: unknown) => {
            // log error server side but do not disclose it to the user to avoid leaking informations
            strapi.log.error(err);
          });
        //send email
      }
      ctx.status = 204;
  
    } catch (error) {
      // Handle potential errors
      ctx.throw(400, error.message || 'failed to resend otp');
    }
   
   
  },

  async forgotPassword(ctx: Context) {
    const input = ctx.request.body as ForgotPassword.Request['body'];

    await validateForgotPasswordInput(input);

    getService('auth').forgotPassword(input);

    ctx.status = 204;
  },

  async resetPassword(ctx: Context) {
    const input = ctx.request.body as ResetPassword.Request['body'];

    await validateResetPasswordInput(input);

    const user = await getService('auth').resetPassword(input);

    ctx.body = {
      data: {
        token: getService('token').createJwtToken(user),
        user: getService('user').sanitizeUser(user),
      },
    } satisfies ResetPassword.Response;
  },

  logout(ctx: Context) {
    const sanitizedUser = getService('user').sanitizeUser(ctx.state.user);
    strapi.eventHub.emit('admin.logout', { user: sanitizedUser });
    ctx.body = { data: {} };
  },
};
