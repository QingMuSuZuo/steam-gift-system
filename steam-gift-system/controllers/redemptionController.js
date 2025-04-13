/**
 * Steam礼物系统 - 提货控制器
 * 处理用户提货流程的所有控制器函数
 */

const RedemptionCode = require('../models/redemptionCode');
const RedemptionRecord = require('../models/redemptionRecord');
const Game = require('../models/game');
const botService = require('../services/botService');
const steamService = require('../services/steamService');
const logger = require('../utils/logger');

/**
 * 渲染提货页面
 */
exports.renderRedemptionPage = async (req, res) => {
  try {
    // 获取错误和成功信息（如果有）
    const { error, success } = req.query;
    
    res.render('public/redemption', {
      title: 'STEAM礼物提货',
      error,
      success
    });
  } catch (err) {
    logger.error(`渲染提货页面出错: ${err.message}`);
    res.status(500).render('public/error', {
      message: '加载提货页面时发生错误，请稍后再试。'
    });
  }
};

/**
 * 处理提货码提交
 */
exports.submitRedemption = async (req, res) => {
  try {
    const { code, steamInput } = req.body;
    
    // 验证输入
    if (!code || !steamInput) {
      return res.status(400).render('public/redemption', {
        title: 'STEAM礼物提货',
        error: '提货码和Steam信息都是必填的。'
      });
    }
    
    // 检查提货码是否存在且未使用
    const redemptionCode = await RedemptionCode.findOne({ code, isUsed: false });
    if (!redemptionCode) {
      return res.status(404).render('public/redemption', {
        title: 'STEAM礼物提货',
        error: '提货码无效或已被使用。'
      });
    }
    
    // 获取关联的游戏信息
    const game = await Game.findById(redemptionCode.gameId);
    if (!game) {
      return res.status(404).render('public/redemption', {
        title: 'STEAM礼物提货',
        error: '关联游戏不存在，请联系客服。'
      });
    }
    
    // 解析Steam ID/URL
    let steamId;
    try {
      steamId = await steamService.parseSteamInput(steamInput);
    } catch (err) {
      return res.status(400).render('public/redemption', {
        title: 'STEAM礼物提货',
        error: '无法识别Steam信息，请确保输入正确的Steam链接或ID。'
      });
    }
    
    // 创建提货记录
    const redemptionRecord = new RedemptionRecord({
      code: redemptionCode.code,
      gameId: redemptionCode.gameId,
      steamId,
      steamUrl: steamInput,
      status: 'pending'
    });
    
    await redemptionRecord.save();
    
    // 启动添加好友流程
    botService.addFriend(steamId, redemptionRecord._id)
      .catch(err => {
        logger.error(`添加好友失败: ${err.message}`);
        // 异步更新状态为失败
        RedemptionRecord.findByIdAndUpdate(
          redemptionRecord._id, 
          { 
            status: 'failed', 
            errorMessage: '添加好友失败，请检查您的Steam个人资料是否公开。'
          }
        ).exec();
      });
    
    // 重定向到状态页面
    res.redirect(`/redeem/status/${redemptionRecord._id}`);
    
  } catch (err) {
    logger.error(`提货请求处理出错: ${err.message}`);
    res.status(500).render('public/error', {
      message: '处理提货请求时发生错误，请稍后再试。'
    });
  }
};

/**
 * 渲染提货状态页面
 */
exports.renderStatusPage = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 获取提货记录
    const redemptionRecord = await RedemptionRecord.findById(id);
    if (!redemptionRecord) {
      return res.status(404).render('public/error', {
        message: '找不到提货记录。'
      });
    }
    
    // 获取游戏信息
    const game = await Game.findById(redemptionRecord.gameId);
    
    res.render('public/status', {
      title: 'STEAM礼物提货状态',
      record: redemptionRecord,
      game,
      message: getStatusMessage(redemptionRecord.status),
      nextStep: getNextStep(redemptionRecord.status)
    });
    
  } catch (err) {
    logger.error(`获取提货状态出错: ${err.message}`);
    res.status(500).render('public/error', {
      message: '加载提货状态时发生错误，请稍后再试。'
    });
  }
};

/**
 * 获取提货状态
 */
exports.getRedemptionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 获取提货记录
    const redemptionRecord = await RedemptionRecord.findById(id);
    if (!redemptionRecord) {
      return res.status(404).json({
        success: false,
        message: '找不到提货记录'
      });
    }
    
    res.json({
      success: true,
      status: redemptionRecord.status,
      message: getStatusMessage(redemptionRecord.status),
      nextStep: getNextStep(redemptionRecord.status),
      errorMessage: redemptionRecord.errorMessage
    });
    
  } catch (err) {
    logger.error(`API获取提货状态出错: ${err.message}`);
    res.status(500).json({
      success: false,
      message: '获取提货状态时发生错误'
    });
  }
};

/**
 * 确认已添加好友
 */
exports.confirmFriendAdded = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 获取提货记录
    const redemptionRecord = await RedemptionRecord.findById(id);
    if (!redemptionRecord) {
      return res.status(404).json({
        success: false,
        message: '找不到提货记录'
      });
    }
    
    // 检查当前状态
    if (redemptionRecord.status !== 'pending' && redemptionRecord.status !== 'friend_requested') {
      return res.status(400).json({
        success: false,
        message: '当前状态无法确认添加好友'
      });
    }
    
    // 检查是否已经添加好友
    const isFriend = await botService.checkFriendStatus(redemptionRecord.steamId);
    
    if (!isFriend) {
      return res.status(400).json({
        success: false,
        message: '未检测到好友关系，请确认您已接受好友请求'
      });
    }
    
    // 更新状态
    redemptionRecord.status = 'friend_added';
    await redemptionRecord.save();
    
    // 启动发送礼物流程
    botService.sendGift(redemptionRecord.steamId, redemptionRecord.gameId, redemptionRecord._id)
      .then(async () => {
        // 标记提货码为已使用
        await RedemptionCode.findOneAndUpdate(
          { code: redemptionRecord.code },
          { isUsed: true, usedAt: new Date() }
        );
        
        // 更新提货记录状态
        redemptionRecord.status = 'completed';
        redemptionRecord.completedAt = new Date();
        await redemptionRecord.save();
      })
      .catch(async err => {
        logger.error(`发送礼物失败: ${err.message}`);
        // 更新状态为失败
        redemptionRecord.status = 'failed';
        redemptionRecord.errorMessage = '发送礼物失败，请联系客服。';
        await redemptionRecord.save();
      });
    
    res.json({
      success: true,
      message: '已确认添加好友，正在处理发送礼物...'
    });
    
  } catch (err) {
    logger.error(`确认添加好友出错: ${err.message}`);
    res.status(500).json({
      success: false,
      message: '确认添加好友时发生错误'
    });
  }
};

/**
 * 根据状态获取对应的提示信息
 */
function getStatusMessage(status) {
  const messages = {
    'pending': '系统正在处理您的请求，请稍候...',
    'friend_requested': '已发送好友请求，请登录Steam接受好友请求。',
    'friend_added': '已成功添加好友，正在准备发送礼物...',
    'gift_sent': '礼物已发送，请登录Steam接收礼物。',
    'completed': '提货成功！礼物已发送至您的Steam账户。',
    'failed': '提货过程中出现错误，请联系客服解决。'
  };
  
  return messages[status] || '正在处理...';
}

/**
 * 根据状态获取下一步操作提示
 */
function getNextStep(status) {
  const steps = {
    'pending': '请耐心等待，系统正在处理您的请求。',
    'friend_requested': '请打开Steam并接受来自我们系统的好友请求，然后点击"已添加好友"按钮。',
    'friend_added': '无需操作，系统正在为您发送礼物。',
    'gift_sent': '请登录Steam查收礼物，并确认接收。',
    'completed': '您已成功提货并接收礼物，感谢使用！',
    'failed': '请联系客服提供您的提货码和Steam信息，我们会尽快为您解决问题。'
  };
  
  return steps[status] || '请等待系统处理...';
}
