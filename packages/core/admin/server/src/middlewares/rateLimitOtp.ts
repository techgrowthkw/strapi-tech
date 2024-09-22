import type { Context, Next } from 'koa';
import path from 'path';
import utils from '@strapi/utils';
import { isString, toLower } from 'lodash/fp';

const { RateLimitError } = utils.errors;

export default (config: any) => 
  async (ctx: Context, next: Next) => {
    // Set default rate limit configuration
    const rateLimitConfig = {
      enabled: true,
      interval: { min: 5 }, // 5 minutes
      max: 5,              // Max 5 requests
      handler(ctx: Context) {
        ctx.status = 429
        ctx.body = {
          message: 'You have exceeded the number of allowed attempts. Please try again later.',
        };
        throw new RateLimitError();
      },
      ...config,           // Allow for additional custom config
    };

    if (rateLimitConfig.enabled) {
      // TODO: TS - Do the dynamic import
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rateLimit = require('koa2-ratelimit').RateLimit;

      const userEmail = toLower(ctx.request.body.email) || 'unknownEmail';
      const requestPath = isString(ctx.request.path)
        ? toLower(path.normalize(ctx.request.path)).replace(/\/$/, '')
        : 'invalidPath';

      const loadConfig = {
        ...rateLimitConfig,
        prefixKey: `${userEmail}:${requestPath}:${ctx.request.ip}`,
      };

      return rateLimit.middleware(loadConfig)(ctx, next);
    }

    return next();
  };
