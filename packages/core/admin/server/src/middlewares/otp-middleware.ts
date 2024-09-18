import type { Context, Next } from 'koa';

import { getService } from '../utils';

export default () => async (ctx: Context, next: Next) => {
  const transferUtils = getService('transfer').utils;
  const { request } = ctx;
  const path = request.path;
  const method = request.method
  const token = request.header.authorization?.split(/\s+/)[1];
  if(!token){
    return next()
  }

  const jwt = require('jsonwebtoken');
  const otpdecode = jwt.verify(token, strapi.config.get('admin.auth.secret'))

  if(otpdecode.otp === 'pending'){
    if(!(path.includes('verifyOtp') ||  path.includes('resendOtp'))){
      return ctx.notFound();
    }
  } 

  console.log("midd",otpdecode)
  
  return next()

  
};
