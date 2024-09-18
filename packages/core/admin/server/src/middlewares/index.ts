import rateLimit from './rateLimit';
import dataTransfer from './data-transfer';
import optMiddleware from './otp-middleware'

export { default as rateLimit } from './rateLimit';
export { default as dataTransfer } from './data-transfer';
export { default as optMiddleware } from './otp-middleware';

export default {
  rateLimit,
  'otp-middleware': optMiddleware,
  'data-transfer': dataTransfer,
};
