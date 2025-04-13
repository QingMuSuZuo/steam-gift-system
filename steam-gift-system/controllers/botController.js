/**
 * Steam Gift System - Bot Controller
 * 
 * 处理与Steam机器人相关的操作，包括:
 * - 添加好友
 * - 发送礼物
 * - 检查好友状态
 * - 处理礼物发送过程
 */

const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const SteamStore = require('steam-store');
const RedemptionRecord = require('../models/redemptionRecord');
const RedemptionCode = require('../models/redemptionCode');
const Game = require('../models/game');
const botConfig = require('../config/bot');
const steamUtils = require('../utils/steamUtils');
const logger = require('../utils/logger');

// 创建Steam客户端实例
const client = new SteamUser();
const community = new SteamCommunity();
const store = new SteamStore({
  sessionID: botConfig.sessionID,
  cookies: botConfig.cookies
});

// 机器人状态
let botStatus = {
  loggedIn: false,
  readyForGifts: false,
  lastLogin: null,
  error: null
};

// 初始化并登录Steam
const initBot = async () => {
  try {
    // 登录Steam
    await new Promise((resolve, reject) => {
      client.logOn({
        accountName: botConfig.username,
        password: botConfig.password,
        twoFactorCode: botConfig.generateAuthCode()
      });

      client.on('loggedOn', () => {
        logger.info('Bot logged into Steam');
        client.setPersona(SteamUser.EPersonaState.Online);
        botStatus.loggedIn = true;
        botStatus.lastLogin = new Date();
        botStatus.error = null;
        resolve();
      });

      client.on('error', (err) => {
        logger.error(`Bot login error: ${err.message}`);
        botStatus.loggedIn = false;
        botStatus.error = err.message;
        reject(err);
      });
    });

    // 设置社区会话
    await new Promise((resolve, reject) => {
      client.on('webSession', (sessionID, cookies) => {
        community.setCookies(cookies);
        store.setCookies(cookies);
        botStatus.readyForGifts = true;
        resolve();
      });
    });

    return true;
  } catch (error) {
    logger.error(`Bot initialization error: ${error.message}`);
    botStatus.error = error.message;
    return false;
  }
};

// 解析Steam ID (支持多种格式)
const parseSteamId = async (steamInput) => {
  try {
    return await steamUtils.parseSteamId(steamInput);
  } catch (error) {
    logger.error(`Error parsing Steam ID: ${error.message}`);
    throw new Error(`无效的Steam ID: ${error.message}`);
  }
};

// 添加好友
const addFriend = async (steamId, recordId) => {
  try {
    if (!botStatus.loggedIn) {
      await initBot();
    }
    
    const record = await RedemptionRecord.findById(recordId);
    if (!record) {
      throw new Error('找不到提货记录');
    }
    
    // 添加好友
    const result = await new Promise((resolve, reject) => {
      community.addFriend(steamId, (err, success) => {
        if (err) {
          logger.error(`Failed to add friend ${steamId}: ${err.message}`);
          reject(err);
        } else {
          logger.info(`Added ${steamId} as friend`);
          resolve(success);
        }
      });
    });
    
    // 更新记录状态
    record.status = 'friend_added';
    record.updatedAt = new Date();
    await record.save();
    
    return result;
  } catch (error) {
    logger.error(`Add friend error: ${error.message}`);
    
    // 更新记录状态为失败
    if (recordId) {
      const record = await RedemptionRecord.findById(recordId);
      if (record) {
        record.status = 'failed';
        record.errorMessage = `添加好友失败: ${error.message}`;
        record.updatedAt = new Date();
        await record.save();
      }
    }
    
    throw error;
  }
};

// 检查好友状态
const checkFriendStatus = async (steamId, recordId) => {
  try {
    if (!botStatus.loggedIn) {
      await initBot();
    }
    
    const friendsList = await new Promise((resolve, reject) => {
      client.getPersonas([steamId], (err, personas) => {
        if (err) {
          reject(err);
        } else {
          resolve(personas);
        }
      });
    });
    
    const isFriend = client.myFriends[steamId] === SteamUser.EFriendRelationship.Friend;
    
    // 更新记录
    if (recordId) {
      const record = await RedemptionRecord.findById(recordId);
      if (record && isFriend && record.status === 'friend_added') {
        record.status = 'friend_confirmed';
        record.updatedAt = new Date();
        await record.save();
      }
    }
    
    return isFriend;
  } catch (error) {
    logger.error(`Check friend status error: ${error.message}`);
    throw error;
  }
};

// 发送游戏礼物
const sendGift = async (recordId) => {
  try {
    if (!botStatus.readyForGifts) {
      await initBot();
    }
    
    const record = await RedemptionRecord.findById(recordId).populate({
      path: 'gameId',
      model: 'Game'
    });
    
    if (!record) {
      throw new Error('找不到提货记录');
    }
    
    // 查询对应的提货码记录
    const codeRecord = await RedemptionCode.findOne({ code: record.code });
    if (!codeRecord) {
      throw new Error('找不到提货码记录');
    }
    
    // 检查好友状态
    const isFriend = await checkFriendStatus(record.steamId, recordId);
    if (!isFriend) {
      throw new Error('用户还不是好友，无法发送礼物');
    }
    
    // 游戏信息
    const game = record.gameId;
    if (!game || !game.appId) {
      throw new Error('无效的游戏信息');
    }
    
    // 执行发送礼物流程
    try {
      // 1. 添加游戏到购物车
      await store.addToCart({
        appid: game.appId,
        gift: true
      });
      
      logger.info(`Added game ${game.name} to cart as gift`);
      
      // 2. 设置礼物接收人
      await store.setGiftRecipient(record.steamId);
      
      logger.info(`Set gift recipient to ${record.steamId}`);
      
      // 3. 结算购物车
      const checkoutResult = await store.checkout({
        giftRecipient: record.steamId,
        agreeToSubscription: true,
        agreeToTerms: true
      });
      
      logger.info(`Checkout completed for ${record.steamId}, result: ${JSON.stringify(checkoutResult)}`);
      
      // 4. 更新记录状态
      record.status = 'gift_sent';
      record.updatedAt = new Date();
      await record.save();
      
      // 5. 更新提货码状态
      codeRecord.isUsed = true;
      codeRecord.usedAt = new Date();
      await codeRecord.save();
      
      return {
        success: true,
        message: '礼物已成功发送',
        transactionId: checkoutResult.transactionId || null
      };
    } catch (error) {
      // 记录详细错误
      logger.error(`Gift sending process error: ${error.message}`);
      
      // 更新记录状态
      record.status = 'failed';
      record.errorMessage = `发送礼物失败: ${error.message}`;
      record.updatedAt = new Date();
      await record.save();
      
      throw error;
    }
  } catch (error) {
    logger.error(`Send gift error: ${error.message}`);
    throw error;
  }
};

// 完成礼物流程
const completeGiftProcess = async (recordId) => {
  try {
    const record = await RedemptionRecord.findById(recordId);
    if (!record) {
      throw new Error('找不到提货记录');
    }
    
    // 检查当前状态
    if (record.status !== 'gift_sent') {
      throw new Error(`无法完成流程，当前状态: ${record.status}`);
    }
    
    // 更新为完成状态
    record.status = 'completed';
    record.completedAt = new Date();
    record.updatedAt = new Date();
    await record.save();
    
    return {
      success: true,
      message: '礼物流程已完成',
      recordId: record._id
    };
  } catch (error) {
    logger.error(`Complete gift process error: ${error.message}`);
    throw error;
  }
};

// 获取机器人状态
const getBotStatus = async () => {
  // 如果已登录但超过24小时，尝试重新登录
  if (botStatus.loggedIn && botStatus.lastLogin) {
    const now = new Date();
    const loginTime = new Date(botStatus.lastLogin);
    const hoursSinceLogin = (now - loginTime) / (1000 * 60 * 60);
    
    if (hoursSinceLogin > 24) {
      try {
        await initBot();
      } catch (error) {
        logger.error(`Auto re-login failed: ${error.message}`);
      }
    }
  }
  
  return {
    loggedIn: botStatus.loggedIn,
    readyForGifts: botStatus.readyForGifts,
    lastLogin: botStatus.lastLogin,
    error: botStatus.error
  };
};

// 重启机器人
const restartBot = async () => {
  try {
    // 如果已登录，先登出
    if (botStatus.loggedIn) {
      client.logOff();
      botStatus.loggedIn = false;
      botStatus.readyForGifts = false;
    }
    
    // 重新登录
    const success = await initBot();
    return {
      success,
      status: await getBotStatus()
    };
  } catch (error) {
    logger.error(`Restart bot error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      status: await getBotStatus()
    };
  }
};

// 在应用启动时初始化机器人
setTimeout(() => {
  initBot().then(success => {
    if (success) {
      logger.info('Bot initialized successfully on startup');
    } else {
      logger.error('Failed to initialize bot on startup');
    }
  });
}, 5000); // 延迟5秒启动，确保其他服务已经准备好

module.exports = {
  addFriend,
  checkFriendStatus,
  sendGift,
  completeGiftProcess,
  getBotStatus,
  restartBot,
  parseSteamId
};
