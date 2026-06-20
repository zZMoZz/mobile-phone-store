import { Router } from 'express';
import productsRouter from './products.js';
import transactionsRouter from './transactions.js';
import serviceTypesRouter from './serviceTypes.js';
import analyticsRouter from './analytics.js';
import settingsRouter from './settings.js';
import dataRouter from './data.js';
import { categoriesRouter, brandsRouter } from './reference.js';
import optionListsRouter from './optionLists.js';
import servicesRouter from './services.js';
import serviceShortcutsRouter from './serviceShortcuts.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

router.use('/products', productsRouter);
router.use('/transactions', transactionsRouter);
router.use('/service-types', serviceTypesRouter);
router.use('/analytics', analyticsRouter);
router.use('/settings', settingsRouter);
router.use('/categories', categoriesRouter);
router.use('/brands', brandsRouter);
router.use('/option-lists', optionListsRouter);
router.use('/services', servicesRouter);
router.use('/service-shortcuts', serviceShortcutsRouter);
router.use('/', dataRouter); // /backup, /export/*.csv

export default router;
