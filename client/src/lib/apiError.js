// Turns an axios error into a user-facing message. The backend may return a
// stable `code` (+ optional `params`) which we translate via i18n so messages
// follow the active language; otherwise we fall back to the server's English
// `error` string, then a generic message.
export function apiErrorMessage(err, t) {
  const data = err?.response?.data;
  if (data?.code) {
    const key = `errors.${data.code}`;
    const msg = t(key, data.params || {});
    if (msg !== key) return msg; // translation exists
  }
  return data?.error || t('common.error');
}
