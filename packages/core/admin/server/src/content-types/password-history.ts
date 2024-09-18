export default {
  collectionName: 'password_histories',
  info: {
    name: 'Password History',
    description: 'Stores user password history for enforcing password policies',
    singularName: 'password-history',
    pluralName: 'password-histories',
    displayName: 'Password History',
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
    passwordHash: {
      type: 'string',
      required: true,
      configurable: false,
    },
    changedAt: {
      type: 'datetime',
      default: new Date(),
      configurable: false,
    },
  },
};
