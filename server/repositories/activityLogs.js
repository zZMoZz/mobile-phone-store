import { getDb } from '../db/connection.js';

export function logActivity({ userId, username, action, entity = null, entityId = null, detail = null }) {
  try {
    getDb()
      .prepare(
        `INSERT INTO activity_logs (user_id, username, action, entity, entity_id, detail)
         VALUES (@userId, @username, @action, @entity, @entityId, @detail)`
      )
      .run({
        userId: userId ?? null,
        username,
        action,
        entity,
        entityId: entityId ?? null,
        detail: detail ? JSON.stringify(detail) : null,
      });
  } catch {
    // Log failures must never block the main response
  }
}

export function listActivity({ from, to, action, userId, page = 1, pageSize = 50 } = {}) {
  const conditions = [];
  const params = {};

  if (from) { conditions.push('created_at >= @from'); params.from = from; }
  if (to)   { conditions.push('created_at <= @to');   params.to = to; }
  if (action) { conditions.push('action = @action');  params.action = action; }
  if (userId) { conditions.push('user_id = @userId'); params.userId = Number(userId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.min(200, Math.max(1, Number(pageSize) || 50));
  const offset = (p - 1) * ps;

  const db = getDb();
  const total = db.prepare(`SELECT COUNT(*) AS c FROM activity_logs ${where}`).get(params).c;
  const items = db
    .prepare(
      `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: ps, offset });

  return { items, total, page: p, pageSize: ps };
}
