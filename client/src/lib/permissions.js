// Client mirror of the server capability catalog (server/lib/permissions.js).
// Grouped for the capability editor; i18n labels live under `permissions.*`.

export const CAPABILITY_GROUPS = [
  {
    group: 'see',
    caps: ['see.cost', 'see.others_transactions', 'see.activity_log'],
  },
  {
    group: 'do',
    caps: [
      'txn.sale',
      'txn.service',
      'txn.expense',
      'txn.return',
      'txn.void',
      'inventory.view',
      'inventory.edit',
      'services.manage',
      'lists.manage',
      'settings.manage',
      'data.backup',
      'users.manage',
    ],
  },
];

export const CAPABILITIES = CAPABILITY_GROUPS.flatMap((g) => g.caps);

export const PRESETS = {
  admin: [...CAPABILITIES],
  staff: ['txn.sale', 'txn.service', 'txn.expense', 'inventory.view'],
};
