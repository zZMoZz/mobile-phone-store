import { Router } from 'express';
import { overview } from '../repositories/analytics.js';

const router = Router();

router.get('/', (req, res) => res.json(overview(req.query)));

export default router;
