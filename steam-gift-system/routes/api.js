/**
 * Steam礼物系统 - API路由
 * 处理所有公共API请求和提货流程
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const redemptionController = require('../controllers/redemptionController');
const botController = require('../controllers/botController');
const rateLimiter = require('../middleware/rateLimiter');

/**
 * 验证中间件 - 验证请求参数
 */
const validateRedemptionRequest = [
  body('code').trim().notEmpty().withMessage('提货码不能为空'),
  body('steamInfo').trim().notEmpty().withMessage('Steam信息不能为空'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  }
];

/**
 * 验证中间件 - 验证确认请求
 */
const validateConfirmRequest = [
  body('recordId').trim().notEmpty().withMessage('记录ID不能为空'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  }
];

/**
 * 提交提货码和Steam信息
 * POST /api/redeem
 */
router.post('/redeem', 
  rateLimiter.redemptionLimiter, 
  validateRedemptionRequest, 
  async (req, res) => {
    try {
      const { code, steamInfo } = req.body;
      const result = await redemptionController.initiateRedemption(code, steamInfo);
      
      if (result.success) {
        return res.status(200).json({
          success: true,
          message: '提货码验证成功，正在添加Steam好友',
          recordId: result.recordId,
          gameName: result.gameName,
          nextStep: 'add_friend'
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('提货请求处理失败:', error);
      return res.status(500).json({
        success: false,
        message: '提货请求处理失败，请稍后再试'
      });
    }
  }
);

/**
 * 检查提货状态
 * GET /api/redeem/status/:recordId
 */
router.get('/redeem/status/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const status = await redemptionController.getRedemptionStatus(recordId);
    
    return res.status(200).json({
      success: true,
      status: status.status,
      message: status.message,
      nextStep: status.nextStep
    });
  } catch (error) {
    console.error('获取提货状态失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取提货状态失败，请稍后再试'
    });
  }
});

/**
 * 确认已添加好友，进行下一步
 * POST /api/redeem/confirm
 */
router.post('/redeem/confirm', 
  validateConfirmRequest, 
  async (req, res) => {
    try {
      const { recordId } = req.body;
      const result = await botController.confirmFriendshipAndSendGift(recordId);
      
      if (result.success) {
        return res.status(200).json({
          success: true,
          message: result.message,
          status: result.status,
          nextStep: result.nextStep
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('确认好友关系失败:', error);
      return res.status(500).json({
        success: false,
        message: '确认好友关系失败，请稍后再试'
      });
    }
  }
);

/**
 * 检查礼物发送状态
 * GET /api/redeem/gift-status/:recordId
 */
router.get('/redeem/gift-status/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const status = await botController.checkGiftStatus(recordId);
    
    return res.status(200).json({
      success: true,
      status: status.status,
      message: status.message,
      completed: status.completed
    });
  } catch (error) {
    console.error('获取礼物发送状态失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取礼物发送状态失败，请稍后再试'
    });
  }
});

/**
 * 报告礼物发送问题
 * POST /api/redeem/report-issue
 */
router.post('/redeem/report-issue',
  [body('recordId').trim().notEmpty(), body('issue').trim().notEmpty()],
  async (req, res) => {
    try {
      const { recordId, issue } = req.body;
      const result = await redemptionController.reportIssue(recordId, issue);
      
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('报告问题失败:', error);
      return res.status(500).json({
        success: false,
        message: '报告问题失败，请稍后再试'
      });
    }
  }
);

/**
 * 获取提货页面所需的游戏信息(通过提货码)
 * GET /api/redeem/game-info/:code
 */
router.get('/redeem/game-info/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const gameInfo = await redemptionController.getGameInfoByCode(code);
    
    if (gameInfo.success) {
      return res.status(200).json({
        success: true,
        gameName: gameInfo.gameName,
        gameImage: gameInfo.gameImage
      });
    } else {
      return res.status(404).json({
        success: false,
        message: gameInfo.message
      });
    }
  } catch (error) {
    console.error('获取游戏信息失败:', error);
    return res.status(500).json({
      success: false,
      message: '获取游戏信息失败，请稍后再试'
    });
  }
});

/**
 * 验证提货码是否有效(不消耗)
 * GET /api/redeem/validate/:code
 */
router.get('/redeem/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const validation = await redemptionController.validateRedemptionCode(code);
    
    return res.status(validation.success ? 200 : 400).json(validation);
  } catch (error) {
    console.error('验证提货码失败:', error);
    return res.status(500).json({
      success: false,
      message: '验证提货码失败，请稍后再试'
    });
  }
});

/**
 * 系统状态API - 检查系统是否正常运行
 * 此API用于健康检查和监控
 * GET /api/status
 */
router.get('/status', async (req, res) => {
  try {
    const botStatus = await botController.getBotStatus();
    
    return res.status(200).json({
      success: true,
      system: 'running',
      botStatus: botStatus.status,
      botOnline: botStatus.online,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('获取系统状态失败:', error);
    return res.status(500).json({
      success: false,
      system: 'error',
      message: '获取系统状态失败',
      timestamp: new Date()
    });
  }
});

module.exports = router;
