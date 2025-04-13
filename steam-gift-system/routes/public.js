const express = require('express');
const router = express.Router();
const redemptionController = require('../controllers/redemptionController');
const { validateRedemptionRequest, validateConfirmRequest } = require('../middleware/validator');
const rateLimit = require('express-rate-limit');

// 配置请求限速器，防止滥用
const redemptionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 每个IP在15分钟内最多5次提货尝试
  message: {
    status: 'error',
    message: '提交次数过多，请稍后再试。'
  }
});

// 状态查询限速器
const statusLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5分钟
  max: 30, // 每个IP在5分钟内最多30次状态查询
  message: {
    status: 'error',
    message: '查询频率过高，请稍后再试。'
  }
});

/**
 * 提货页面
 * GET /
 */
router.get('/', (req, res) => {
  res.render('public/redemption', {
    title: 'STEAM礼物提货',
    subtitle: '24H自动发货',
    error: req.query.error || null
  });
});

/**
 * 提交提货请求
 * POST /redeem
 * Body: { code, steamContact }
 */
router.post('/redeem', redemptionLimiter, validateRedemptionRequest, redemptionController.initiateRedemption);

/**
 * 查询提货状态
 * GET /redeem/status/:id
 */
router.get('/redeem/status/:id', statusLimiter, redemptionController.getRedemptionStatus);

/**
 * 确认已添加好友，进行下一步
 * POST /redeem/confirm/:id
 */
router.post('/redeem/confirm/:id', validateConfirmRequest, redemptionController.confirmFriendAdded);

/**
 * 显示提货成功页面
 * GET /redeem/success
 */
router.get('/redeem/success', (req, res) => {
  const { game, recordId } = req.query;
  
  if (!game || !recordId) {
    return res.redirect('/');
  }
  
  res.render('public/success', {
    title: '提货成功',
    gameName: game,
    recordId: recordId
  });
});

/**
 * 显示错误页面
 * GET /redeem/error
 */
router.get('/redeem/error', (req, res) => {
  const { message } = req.query;
  
  res.render('public/error', {
    title: '提货失败',
    message: message || '处理您的请求时发生错误，请稍后再试或联系客服。'
  });
});

/**
 * 查看提货说明页面
 * GET /instructions
 */
router.get('/instructions', (req, res) => {
  res.render('public/instructions', {
    title: '提货说明'
  });
});

/**
 * 查看常见问题页面
 * GET /faq
 */
router.get('/faq', (req, res) => {
  res.render('public/faq', {
    title: '常见问题'
  });
});

module.exports = router;
