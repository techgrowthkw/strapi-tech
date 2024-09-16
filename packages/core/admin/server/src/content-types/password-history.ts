/**
 * Lifecycle callbacks for the `Role` model.
 */

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
  pluginOptions: {},
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
    },
    changedAt: {
      type: 'datetime',
      default: new Date(),
    },
  },
};
