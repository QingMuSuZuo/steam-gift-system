const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const gameController = require('../controllers/gameController');
const authMiddleware = require('../middleware/auth');
const { validateGameInput, validateCodeGeneration, validateSettings } = require('../middleware/validator');

// 登录相关路由 - 无需认证
router.get('/login', adminController.getLoginPage);
router.post('/login', adminController.login);

// 以下路由需要管理员认证
router.use(authMiddleware.requireAuth);

// 系统首页
router.get('/dashboard', adminController.getDashboard);

// 游戏管理路由
router.get('/games', gameController.getGamesPage);
router.post('/games', validateGameInput, gameController.createGame);
router.get('/games/:id', gameController.getGameDetails);
router.put('/games/:id', validateGameInput, gameController.updateGame);
router.delete('/games/:id', gameController.deleteGame);

// 提货码管理路由
router.get('/games/:id/codes', gameController.getGameCodesPage);
router.post('/games/:id/codes', validateCodeGeneration, gameController.generateCodes);
router.delete('/games/:id/codes/:codeId', gameController.deleteCode);

// 发货记录路由
router.get('/records', adminController.getRecordsPage);
router.get('/records/:id', adminController.getRecordDetails);
router.put('/records/:id/cancel', adminController.cancelRedemption);
router.put('/records/:id/retry', adminController.retryRedemption);

// 设置路由
router.get('/settings', adminController.getSettingsPage);
router.put('/settings/profile', validateSettings.profile, adminController.updateProfile);
router.put('/settings/password', validateSettings.password, adminController.updatePassword);

// 系统状态API
router.get('/api/status', adminController.getSystemStatus);
router.get('/api/stats', adminController.getSystemStats);

// 登出
router.get('/logout', adminController.logout);

module.exports = router;
