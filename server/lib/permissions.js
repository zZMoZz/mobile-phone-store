// Per-user capability model. The owner implicitly holds every capability;
// all other users carry an explicit JSON array of these keys.

export const CAPABILITIES = [
  // See (visibility)
  'see.cost',                 // cost & profit/margin columns
  'see.others_transactions',  // username filter on transactions & activity log
  'see.activity_log',         // access the activity log
  // Do (actions)
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
];

const CAP_SET = new Set(CAPABILITIES);

// Presets only pre-fill the capability checklist at creation time; after that a
// user's access is driven purely by their stored permissions array.
export const PRESETS = {
  admin: [...CAPABILITIES],
  staff: ['txn.sale', 'txn.service', 'txn.expense', 'inventory.view'],
};

/** True if the user may perform `cap`. The owner always passes. */
export function userHas(user, cap) {
  if (user?.role === 'owner') return true;
  return Array.isArray(user?.permissions) && user.permissions.includes(cap);
}

/** Keep only known capability keys, de-duplicated and in catalog order. */
export function sanitizePermissions(arr) {
  if (!Array.isArray(arr)) return [];
  const wanted = new Set(arr.filter((k) => CAP_SET.has(k)));
  return CAPABILITIES.filter((k) => wanted.has(k));
}
