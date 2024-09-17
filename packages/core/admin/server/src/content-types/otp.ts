/**
 * Lifecycle callbacks for the `Role` model.
 */

export default {
  collectionName: 'otp',
  info: {
    name: 'otp',
    description: '',
    singularName: 'otp',
    pluralName: 'otps',
    displayName: 'otp',
  },
  options: {},
  pluginOptions: {
    'content-manager': {
      visible: false,
    },
    'content-type-builder': {
      visible: false,
    },
  },
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
      configurable: false,
      default: new Date(),
      required: true,
    },
  },
};
