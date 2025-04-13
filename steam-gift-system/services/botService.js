/**
 * Steam礼物系统机器人服务
 * 处理与Steam平台的交互，包括登录、添加好友、发送礼物等操作
 */
const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const SteamStore = require('steamstore');
const SteamTotp = require('steam-totp');
const EventEmitter = require('events');
const config = require('../config/bot');
const logger = require('../utils/logger');
const RedemptionRecord = require('../models/redemptionRecord');
const Game = require('../models/game');
const steamUtils = require('../utils/steamUtils');

class BotService extends EventEmitter {
  constructor() {
    super();
    this.client = new SteamUser();
    this.community = new SteamCommunity();
    this.store = new SteamStore();
    this.loggedIn = false;
    this.pendingFriendRequests = new Map();
    this.pendingGiftSends = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.setupEventHandlers();
  }

  /**
   * 设置Steam客户端的事件处理器
   */
  setupEventHandlers() {
    // 登录事件
    this.client.on('loggedOn', () => {
      logger.info('Steam机器人已登录');
      this.loggedIn = true;
      this.reconnectAttempts = 0;
      this.client.setPersona(SteamUser.EPersonaState.Online);
      this.emit('ready');
    });

    // 会话刷新事件
    this.client.on('webSession', (sessionID, cookies) => {
      logger.info('获取Steam Web会话');
      this.community.setCookies(cookies);
      this.store.setCookies(cookies);
      
      // 处理所有待处理的好友请求
      this.processPendingFriendRequests();
    });

    // 好友关系事件
    this.client.on('friendRelationship', (steamID, relationship) => {
      const steamId = steamID.getSteamID64();
      logger.info(`好友关系变更: ${steamId}, 状态: ${relationship}`);
      
      if (relationship === SteamUser.EFriendRelationship.Friend) {
        logger.info(`用户 ${steamId} 已接受好友请求`);
        this.handleFriendRequestAccepted(steamId);
      }
    });

    // 断开连接事件
    this.client.on('disconnected', (eresult, msg) => {
      logger.warn(`Steam客户端断开连接: ${msg || eresult}`);
      this.loggedIn = false;
      this.attemptReconnect();
    });

    // 错误事件
    this.client.on('error', (err) => {
      logger.error(`Steam客户端错误: ${err.message}`);
      this.loggedIn = false;
      this.attemptReconnect();
    });
    
    // 礼物事件
    this.store.on('giftSent', (giftId, targetUser) => {
      logger.info(`礼物发送成功: ID ${giftId} 至用户 ${targetUser}`);
      this.handleGiftSent(targetUser, giftId, true);
    });
    
    this.store.on('giftError', (targetUser, error) => {
      logger.error(`礼物发送失败至 ${targetUser}: ${error.message}`);
      this.handleGiftSent(targetUser, null, false, error.message);
    });
  }

  /**
   * 启动Steam机器人
   */
  async start() {
    if (this.loggedIn) {
      logger.info('Steam机器人已经登录');
      return;
    }

    try {
      const authCode = SteamTotp.generateAuthCode(config.sharedSecret);
      
      const logOnOptions = {
        accountName: config.username,
        password: config.password,
        twoFactorCode: authCode
      };
      
      logger.info('正在登录Steam机器人...');
      this.client.logOn(logOnOptions);
    } catch (err) {
      logger.error(`Steam机器人启动失败: ${err.message}`);
      throw err;
    }
  }

  /**
   * 尝试重新连接Steam
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('达到最大重连尝试次数，停止重连');
      this.emit('reconnectFailed');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(30000, 5000 * this.reconnectAttempts);
    
    logger.info(`${delay/1000}秒后尝试重新连接Steam (尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.start().catch(err => {
        logger.error(`重新连接失败: ${err.message}`);
      });
    }, delay);
  }

  /**
   * 解析Steam ID
   * 支持多种格式: 好友代码、个人资料URL、SteamID64
   */
  async resolveSteamId(steamIdOrUrl) {
    try {
      return await steamUtils.resolveSteamId(steamIdOrUrl);
    } catch (err) {
      logger.error(`解析Steam ID失败: ${err.message}`);
      throw new Error(`无法识别Steam ID: ${err.message}`);
    }
  }
  
  /**
   * 开始提货流程
   * @param {string} recordId - 提货记录ID
   */
  async startRedemptionProcess(recordId) {
    try {
      const record = await RedemptionRecord.findById(recordId);
      if (!record) {
        throw new Error('找不到提货记录');
      }
      
      if (record.status !== 'pending') {
        logger.info(`提货记录 ${recordId} 已处理，当前状态: ${record.status}`);
        return record;
      }
      
      // 确保机器人已登录
      if (!this.loggedIn) {
        await this.start();
      }
      
      // 解析用户的Steam ID
      const steamId = await this.resolveSteamId(record.steamUrl);
      record.steamId = steamId;
      record.status = 'processing';
      await record.save();
      
      // 添加好友
      await this.addFriend(recordId, steamId);
      
      return record;
    } catch (err) {
      logger.error(`启动提货流程失败: ${err.message}`);
      await this.updateRecordStatus(recordId, 'failed', err.message);
      throw err;
    }
  }
  
  /**
   * 添加好友
   * @param {string} recordId - 提货记录ID
   * @param {string} steamId - 目标用户的SteamID64
   */
  async addFriend(recordId, steamId) {
    if (!this.loggedIn) {
      throw new Error('Steam机器人未登录');
    }
    
    try {
      logger.info(`正在添加好友: ${steamId}`);
      
      // 记录这个待处理的好友请求
      this.pendingFriendRequests.set(steamId, recordId);
      
      // 添加好友
      this.client.addFriend(steamId, (err, friendName) => {
        if (err) {
          logger.error(`添加好友失败: ${err.message}`);
          this.updateRecordStatus(recordId, 'failed', `添加好友失败: ${err.message}`);
          this.pendingFriendRequests.delete(steamId);
        } else {
          logger.info(`好友请求已发送至 ${friendName || steamId}`);
          this.updateRecordStatus(recordId, 'friend_request_sent');
        }
      });
      
      return true;
    } catch (err) {
      logger.error(`添加好友失败: ${err.message}`);
      await this.updateRecordStatus(recordId, 'failed', err.message);
      throw err;
    }
  }
  
  /**
   * 处理所有待处理的好友请求
   */
  processPendingFriendRequests() {
    if (this.pendingFriendRequests.size === 0) {
      return;
    }
    
    logger.info(`处理 ${this.pendingFriendRequests.size} 个待处理的好友请求`);
    
    for (const [steamId, recordId] of this.pendingFriendRequests.entries()) {
      this.client.addFriend(steamId, (err, friendName) => {
        if (err) {
          logger.error(`处理待处理好友请求失败: ${err.message}`);
          this.updateRecordStatus(recordId, 'failed', `添加好友失败: ${err.message}`);
        } else {
          logger.info(`好友请求已发送至 ${friendName || steamId}`);
          this.updateRecordStatus(recordId, 'friend_request_sent');
        }
      });
    }
  }
  
  /**
   * 处理好友请求被接受
   * @param {string} steamId - 接受好友请求的用户SteamID64
   */
  async handleFriendRequestAccepted(steamId) {
    const recordId = this.pendingFriendRequests.get(steamId);
    if (!recordId) {
      logger.warn(`用户 ${steamId} 接受了好友请求，但找不到对应的提货记录`);
      return;
    }
    
    try {
      await this.updateRecordStatus(recordId, 'friend_added');
      this.pendingFriendRequests.delete(steamId);
      
      // 发送通知消息
      this.client.chat.sendFriendMessage(steamId, '您好！我是礼物自动发货机器人。当您准备好接收游戏礼物时，请在提货页面点击"下一步"按钮。');
      
    } catch (err) {
      logger.error(`更新好友添加状态失败: ${err.message}`);
    }
  }
  
  /**
   * 检查好友状态
   * @param {string} recordId - 提货记录ID
   */
  async checkFriendStatus(recordId) {
    try {
      const record = await RedemptionRecord.findById(recordId);
      if (!record || !record.steamId) {
        throw new Error('找不到提货记录或Steam ID');
      }
      
      const relationship = this.client.friends[record.steamId];
      const isFriend = relationship === SteamUser.EFriendRelationship.Friend;
      
      logger.info(`检查好友状态: ${record.steamId}, 是好友: ${isFriend}`);
      
      if (isFriend) {
        await this.updateRecordStatus(recordId, 'friend_added');
        return true;
      } else {
        const pending = this.pendingFriendRequests.has(record.steamId);
        logger.info(`用户未添加为好友，请求状态: ${pending ? '待处理' : '无请求'}`);
        return false;
      }
    } catch (err) {
      logger.error(`检查好友状态失败: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * 发送游戏礼物
   * @param {string} recordId - 提货记录ID
   */
  async sendGameGift(recordId) {
    try {
      const record = await RedemptionRecord.findById(recordId).populate('gameId');
      if (!record) {
        throw new Error('找不到提货记录');
      }
      
      if (!record.gameId) {
        throw new Error('找不到关联的游戏信息');
      }
      
      if (!record.steamId) {
        throw new Error('找不到用户的Steam ID');
      }
      
      // 确认是否为好友
      const isFriend = await this.checkFriendStatus(recordId);
      if (!isFriend) {
        throw new Error('用户不是好友，无法发送礼物');
      }
      
      const game = record.gameId;
      const appId = game.appId;
      const steamId = record.steamId;
      
      logger.info(`准备发送游戏礼物 ${game.name} (AppID: ${appId}) 给用户 ${steamId}`);
      
      // 更新状态为正在发送礼物
      await this.updateRecordStatus(recordId, 'sending_gift');
      
      // 添加到待处理礼物列表
      this.pendingGiftSends.set(steamId, recordId);
      
      // 发送礼物
      this.store.purchaseGift(appId, steamId, (err, giftId) => {
        if (err) {
          logger.error(`发送礼物失败: ${err.message}`);
          this.handleGiftSent(steamId, null, false, err.message);
        } else {
          logger.info(`礼物已发送 - ID: ${giftId}`);
          this.handleGiftSent(steamId, giftId, true);
        }
      });
      
      return record;
    } catch (err) {
      logger.error(`发送游戏礼物失败: ${err.message}`);
      await this.updateRecordStatus(recordId, 'failed', err.message);
      throw err;
    }
  }
  
  /**
   * 处理礼物发送结果
   * @param {string} steamId - 目标用户的SteamID64
   * @param {string} giftId - 礼物ID（如果成功）
   * @param {boolean} success - 是否成功
   * @param {string} errorMessage - 错误信息（如果失败）
   */
  async handleGiftSent(steamId, giftId, success, errorMessage = null) {
    const recordId = this.pendingGiftSends.get(steamId);
    if (!recordId) {
      logger.warn(`礼物发送结果无法关联到提货记录: ${steamId}`);
      return;
    }
    
    try {
      if (success) {
        // 发送成功消息给用户
        this.client.chat.sendFriendMessage(steamId, '礼物已成功发送给您！请在Steam客户端中查收并接受礼物。祝您玩得愉快！');
        await this.updateRecordStatus(recordId, 'completed');
      } else {
        // 发送失败消息给用户
        this.client.chat.sendFriendMessage(steamId, '很抱歉，礼物发送失败。请联系客服获取帮助。');
        await this.updateRecordStatus(recordId, 'failed', errorMessage);
      }
      
      this.pendingGiftSends.delete(steamId);
    } catch (err) {
      logger.error(`更新礼物发送状态失败: ${err.message}`);
    }
  }
  
  /**
   * 更新提货记录状态
   * @param {string} recordId - 提货记录ID
   * @param {string} status - 新状态
   * @param {string} errorMessage - 错误信息（如果有）
   */
  async updateRecordStatus(recordId, status, errorMessage = null) {
    try {
      const updates = { status };
      
      if (errorMessage) {
        updates.errorMessage = errorMessage;
      }
      
      if (status === 'completed') {
        updates.completedAt = new Date();
      }
      
      updates.updatedAt = new Date();
      
      const record = await RedemptionRecord.findByIdAndUpdate(
        recordId,
        { $set: updates },
        { new: true }
      );
      
      logger.info(`提货记录 ${recordId} 状态已更新为 ${status}`);
      this.emit('statusUpdate', record);
      
      return record;
    } catch (err) {
      logger.error(`更新提货记录状态失败: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * 检查系统状态
   * @returns {Object} 状态信息
   */
  async checkSystemStatus() {
    return {
      botLoggedIn: this.loggedIn,
      pendingFriendRequests: this.pendingFriendRequests.size,
      pendingGiftSends: this.pendingGiftSends.size
    };
  }
  
  /**
   * 关闭Steam机器人
   */
  shutdown() {
    logger.info('正在关闭Steam机器人...');
    this.client.logOff();
    this.client.removeAllListeners();
    this.loggedIn = false;
  }
}

// 创建单例实例
const botService = new BotService();

module.exports = botService;
