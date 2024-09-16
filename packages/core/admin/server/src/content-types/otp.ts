/**
 * Lifecycle callbacks for the `Role` model.
 */

export default {
  collectionName: 'otp',
  info: {
    name: 'otp',
    description: 'OTP model',
    singularName: 'otp',
    pluralName: 'otps',
    displayName: 'otp',
  },
  options: {},
  pluginOptions: {},
  attributes: {
    user: {
      type: 'relation',
      relation: 'manyToOne',
      target: 'admin::user',
      required: true,
    },
    otp: {
      type: 'string',
      required: true,
      unique: true,
    },
    createdAt: {
      type: 'datetime',
      default: new Date(),
    },
  },
};
