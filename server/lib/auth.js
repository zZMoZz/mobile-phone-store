import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'store-local-secret-change-me';

export const signToken = (payload) => jwt.sign(payload, SECRET, { expiresIn: '12h' });
export const verifyToken = (token) => jwt.verify(token, SECRET);
