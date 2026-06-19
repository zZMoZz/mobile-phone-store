import { Router } from 'express';
import * as settings from '../repositories/settings.js';

const router = Router();

router.get('/', (req, res) => res.json(settings.get()));

router.put('/', (req, res) => res.json(settings.update(req.body)));

export default router;
