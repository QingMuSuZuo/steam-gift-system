const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const SteamTotp = require('steam-totp');
const puppeteer = require('puppeteer');
const logger = require('../utils/logger');
const config = require('../config/bot');
const RedemptionRecord = require('../models/redemptionRecord');
const Game = require('../models/game');

class SteamBot {
  constructor() {
    this.client = new SteamUser();
    this.community = new SteamCommunity();
    this.isLoggedIn = false;
    this.isReady = false;
    this.browser = null;
    this.pendingFriendRequests = new Map();
    this.pendingGifts = new Map();
    this.retryQueue = [];
    this.botStatus = {
      online: false,
      lastLogin: null,
      errors: [],
      pendingRequests: 0
    };

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Steam客户端事件
    this.client.on('loggedOn', () => {
      logger.info('Bot logged into Steam');
      this.isLoggedIn = true;
      this.botStatus.online = true;
      this.botStatus.lastLogin = new Date();
      this.client.setPersona(SteamUser.EPersonaState.Online);
    });

    this.client.on('error', (err) => {
      logger.error(`Steam client error: ${err.message}`);
      this.isLoggedIn = false;
      this.botStatus.online = false;
      this.botStatus.errors.push({
        time: new Date(),
        message: err.message
      });
      
      // 保留最近10个错误
      if (this.botStatus.errors.length > 10) {
        this.botStatus.errors.shift();
      }
      
      // 尝试重新登录
      setTimeout(() => this.login(), 60000);
    });

    // 好友相关事件
    this.client.on('friendRelationship', async (steamId, relationship) => {
      if (relationship === SteamUser.EFriendRelationship.Friend) {
        logger.info(`New friend added: ${steamId}`);
        
        // 检查是否是待处理的好友请求
        if (this.pendingFriendRequests.has(steamId.toString())) {
          const recordId = this.pendingFriendRequests.get(steamId.toString());
          this.pendingFriendRequests.delete(steamId.toString());
          
          try {
            await RedemptionRecord.findByIdAndUpdate(recordId, {
              status: 'friend_added',
              updatedAt: new Date()
            });
            
            // 检查是否需要立即发送礼物
            const record = await RedemptionRecord.findById(recordId);
            if (record && record.autoSendGift) {
              this.sendGift(recordId);
            }
          } catch (err) {
            logger.error(`Failed to update record for ${steamId}: ${err.message}`);
          }
        }
      }
    });

    this.client.on('friendMessage', (steamId, message) => {
      logger.info(`Message from ${steamId}: ${message}`);
      // 可以添加自动回复功能
    });

    // Community事件
    this.community.on('sessionExpired', () => {
      logger.warn('Community session expired, relogging');
      this.login();
    });
  }

  async initBrowser() {
    if (!this.browser) {
      logger.info('Initializing headless browser');
      this.browser = await puppeteer.launch({
        headless: config.headless !== false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  async login() {
    try {
      logger.info('Attempting to log in to Steam...');
      
      if (!config.username || !config.password) {
        throw new Error('Steam credentials are not configured');
      }

      const logOnOptions = {
        accountName: config.username,
        password: config.password,
        rememberPassword: true
      };

      // 如果配置了两步验证，则添加验证码
      if (config.sharedSecret) {
        logOnOptions.twoFactorCode = SteamTotp.generateAuthCode(config.sharedSecret);
      }

      await new Promise((resolve, reject) => {
        this.client.logOn(logOnOptions);
        
        // 设置超时
        const timeout = setTimeout(() => {
          reject(new Error('Login timeout'));
        }, 30000);
        
        this.client.once('loggedOn', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        this.client.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // 等待Web会话
      await new Promise((resolve, reject) => {
        this.client.on('webSession', (sessionId, cookies) => {
          this.community.setCookies(cookies);
          
          // 同时初始化浏览器，为后续礼物发送做准备
          this.initBrowser().then(() => {
            // 应用cookies到浏览器
            this.applyWebSessionToBrowser(cookies).then(() => {
              this.isReady = true;
              resolve();
            }).catch(reject);
          }).catch(reject);
        });
      });

      logger.info('Bot successfully logged in and ready');
      
      // 处理重试队列
      this.processRetryQueue();
      
      return true;
    } catch (err) {
      logger.error(`Failed to log in to Steam: ${err.message}`);
      this.isLoggedIn = false;
      this.isReady = false;
      this.botStatus.online = false;
      this.botStatus.errors.push({
        time: new Date(),
        message: err.message
      });
      return false;
    }
  }

  async applyWebSessionToBrowser(cookies) {
    try {
      const browser = await this.initBrowser();
      const page = await browser.newPage();
      
      // 设置cookies
      for (const cookie of cookies) {
        await page.setCookie({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expiry || -1,
          httpOnly: cookie.httponly || false,
          secure: cookie.secure || false
        });
      }
      
      // 验证登录状态
      await page.goto('https://store.steampowered.com/account/', { waitUntil: 'networkidle2' });
      const isLoggedIn = await page.evaluate(() => {
        return document.body.textContent.includes('Account details');
      });
      
      if (!isLoggedIn) {
        throw new Error('Failed to apply web session to browser');
      }
      
      logger.info('Web session successfully applied to browser');
      await page.close();
      return true;
    } catch (err) {
      logger.error(`Failed to apply web session to browser: ${err.message}`);
      throw err;
    }
  }

  async addFriend(steamId, recordId) {
    try {
      if (!this.isReady) {
        logger.warn('Bot not ready, adding to retry queue');
        this.retryQueue.push({ action: 'addFriend', steamId, recordId });
        return false;
      }

      // 解析不同类型的Steam ID输入
      const parsedSteamId = await this.parseSteamId(steamId);
      if (!parsedSteamId) {
        throw new Error('Invalid Steam ID');
      }

      // 存储待处理的好友请求
      this.pendingFriendRequests.set(parsedSteamId.toString(), recordId);
      this.botStatus.pendingRequests++;

      logger.info(`Adding ${parsedSteamId} as friend for record ${recordId}`);
      this.client.addFriend(parsedSteamId);

      // 更新记录状态
      await RedemptionRecord.findByIdAndUpdate(recordId, {
        status: 'pending',
        steamId: parsedSteamId.toString(),
        updatedAt: new Date()
      });

      return true;
    } catch (err) {
      logger.error(`Failed to add friend ${steamId}: ${err.message}`);
      await this.updateRecordWithError(recordId, err.message);
      return false;
    }
  }

  async sendGift(recordId) {
    let page = null;
    try {
      if (!this.isReady) {
        logger.warn('Bot not ready, adding to retry queue');
        this.retryQueue.push({ action: 'sendGift', recordId });
        return false;
      }

      const record = await RedemptionRecord.findById(recordId);
      if (!record) {
        throw new Error('Redemption record not found');
      }

      if (record.status !== 'friend_added') {
        throw new Error(`Cannot send gift: incorrect status '${record.status}'`);
      }

      const game = await Game.findById(record.gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      logger.info(`Sending gift ${game.name} to ${record.steamId} for record ${recordId}`);

      // 更新记录状态
      await RedemptionRecord.findByIdAndUpdate(recordId, {
        status: 'gift_sending',
        updatedAt: new Date()
      });

      const browser = await this.initBrowser();
      page = await browser.newPage();
      
      // 设置超时
      page.setDefaultTimeout(60000);
      
      // 监听控制台错误
      page.on('console', msg => {
        if (msg.type() === 'error') {
          logger.error(`Browser console error: ${msg.text()}`);
        }
      });

      // 实际的礼物发送流程
      // 1. 打开游戏页面
      logger.info(`Opening game page: ${game.steamLink}`);
      await page.goto(game.steamLink, { waitUntil: 'networkidle2' });
      
      // 2. 检查是否有年龄检查
      const hasAgeCheck = await page.evaluate(() => {
        return document.querySelector('#app_agegate') !== null;
      });
      
      if (hasAgeCheck) {
        logger.info('Handling age verification');
        // 选择年份
        await page.select('#ageYear', '1980');
        // 点击进入按钮
        await Promise.all([
          page.click('#view_product_page_btn'),
          page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);
      }

      // 3. 点击添加到购物车按钮
      logger.info('Adding game to cart');
      const addToCartSelector = '.btn_addtocart';
      await page.waitForSelector(addToCartSelector);
      await Promise.all([
        page.click(addToCartSelector),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
      ]);

      // 4. 检查是否已在购物车
      const cartUrl = 'https://store.steampowered.com/cart/';
      await page.goto(cartUrl, { waitUntil: 'networkidle2' });
      
      // 5. 点击"购买作为礼物"选项
      logger.info('Selecting purchase as gift option');
      const purchaseAsGiftSelector = '.cart_status_message > span:nth-child(1) > a:nth-child(1)';
      await page.waitForSelector(purchaseAsGiftSelector);
      await Promise.all([
        page.click(purchaseAsGiftSelector),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
      ]);

      // 6. 选择好友
      logger.info(`Selecting friend: ${record.steamId}`);
      // 等待好友列表加载
      await page.waitForSelector('.friend_block');
      
      // 找到对应的好友
      const friendFound = await page.evaluate((steamId) => {
        const friends = document.querySelectorAll('.friend_block');
        for (let i = 0; i < friends.length; i++) {
          const friend = friends[i];
          // 检查data-steamid属性或其他标识
          if (friend.getAttribute('data-steamid') === steamId || 
              friend.textContent.includes(steamId)) {
            friend.click();
            return true;
          }
        }
        return false;
      }, record.steamId);
      
      if (!friendFound) {
        throw new Error(`Friend ${record.steamId} not found in gift recipients list`);
      }
      
      // 7. 继续到下一步
      logger.info('Proceeding to next step');
      const continueBtn = '.btn_medium.btn_green_white_innerfade';
      await page.waitForSelector(continueBtn);
      await Promise.all([
        page.click(continueBtn),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
      ]);

      // 8. 添加礼物消息
      logger.info('Adding gift message');
      const messageSelector = '#gift_message_text';
      await page.waitForSelector(messageSelector);
      await page.type(messageSelector, 'Enjoy your game! From Steam Gift System');
      
      // 9. 继续到支付页面
      logger.info('Proceeding to payment');
      await Promise.all([
        page.click(continueBtn),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
      ]);

      // 10. 选择支付方式（假设已有钱包余额）
      logger.info('Selecting payment method');
      const walletSelector = '#payment_method_selector_wallet';
      await page.waitForSelector(walletSelector);
      await page.click(walletSelector);
      
      // 11. 同意服务条款
      logger.info('Accepting terms');
      const termsSelector = '#accept_ssa';
      await page.waitForSelector(termsSelector);
      await page.click(termsSelector);
      
      // 12. 完成购买
      logger.info('Completing purchase');
      const purchaseSelector = '#purchase_button_bottom_text';
      await page.waitForSelector(purchaseSelector);
      
      // 点击购买并等待结果
      await Promise.all([
        page.click(purchaseSelector),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
      ]);
      
      // 13. 验证购买成功
      const success = await page.evaluate(() => {
        // 检查是否有成功提示
        return document.body.textContent.includes('Thank you for your purchase!') ||
               document.body.textContent.includes('Your purchase is complete');
      });
      
      if (success) {
        // 更新记录为完成状态
        await RedemptionRecord.findByIdAndUpdate(recordId, {
          status: 'completed',
          updatedAt: new Date(),
          completedAt: new Date()
        });
        
        logger.info(`Gift successfully sent to ${record.steamId}`);
        return true;
      } else {
        // 检查是否有具体错误信息
        const errorMsg = await page.evaluate(() => {
          const errorEl = document.querySelector('.checkout_error');
          return errorEl ? errorEl.textContent.trim() : 'Unknown purchase error';
        });
        
        throw new Error(errorMsg);
      }
    } catch (err) {
      logger.error(`Failed to send gift for record ${recordId}: ${err.message}`);
      
      // 如果可能，截取页面截图以帮助调试
      if (page) {
        try {
          const screenshot = await page.screenshot();
          logger.error(`Error screenshot saved: ${recordId}_error.png`);
          // 可以添加将截图保存到文件或数据库的逻辑
        } catch (screenshotErr) {
          logger.error(`Failed to take error screenshot: ${screenshotErr.message}`);
        }
      }
      
      await this.updateRecordWithError(recordId, err.message);
      return false;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  async checkFriendStatus(steamId) {
    if (!this.isReady) {
      return false;
    }

    try {
      const relationship = this.client.friends[steamId];
      return relationship === SteamUser.EFriendRelationship.Friend;
    } catch (err) {
      logger.error(`Failed to check friend status for ${steamId}: ${err.message}`);
      return false;
    }
  }

  async parseSteamId(input) {
    // 处理不同格式的Steam ID
    input = input.trim();

    // 检查是否是直接的SteamID64
    if (/^[0-9]{17}$/.test(input)) {
      return input;
    }

    // 检查是否是URL
    if (input.includes('steamcommunity.com')) {
      // 提取个人资料URL中的ID
      const match = input.match(/steamcommunity\.com\/(id|profiles)\/([^\/]+)/);
      if (match) {
        const type = match[1];
        const identifier = match[2];

        if (type === 'profiles' && /^[0-9]{17}$/.test(identifier)) {
          return identifier;
        } else if (type === 'id') {
          // 需要解析自定义URL
          return new Promise((resolve, reject) => {
            this.community.getSteamUser(identifier, (err, user) => {
              if (err) {
                reject(err);
              } else {
                resolve(user.steamID.toString());
              }
            });
          });
        }
      }
    }

    // 尝试使用好友代码（Friend Code）
    if (/^[A-Z0-9]{5}-[A-Z0-9]{4}$/.test(input)) {
      return new Promise((resolve, reject) => {
        this.community.getSteamUserFromFriendCode(input, (err, user) => {
          if (err) {
            reject(err);
          } else {
            resolve(user.steamID.toString());
          }
        });
      });
    }

    throw new Error('Invalid Steam ID format');
  }

  async processRetryQueue() {
    if (this.retryQueue.length > 0 && this.isReady) {
      logger.info(`Processing retry queue (${this.retryQueue.length} items)`);
      
      const queue = [...this.retryQueue];
      this.retryQueue = [];
      
      for (const task of queue) {
        try {
          if (task.action === 'addFriend') {
            await this.addFriend(task.steamId, task.recordId);
          } else if (task.action === 'sendGift') {
            await this.sendGift(task.recordId);
          }
        } catch (err) {
          logger.error(`Failed to process retry task: ${err.message}`);
          // 放回队列，但避免无限循环
          if (!task.retryCount || task.retryCount < 3) {
            task.retryCount = (task.retryCount || 0) + 1;
            this.retryQueue.push(task);
          } else {
            logger.error(`Abandoning task after 3 retries: ${JSON.stringify(task)}`);
            if (task.recordId) {
              this.updateRecordWithError(task.recordId, 'Maximum retry attempts reached');
            }
          }
        }
      }
    }
  }

  async updateRecordWithError(recordId, errorMessage) {
    try {
      await RedemptionRecord.findByIdAndUpdate(recordId, {
        status: 'failed',
        errorMessage: errorMessage,
        updatedAt: new Date()
      });
    } catch (err) {
      logger.error(`Failed to update record ${recordId} with error: ${err.message}`);
    }
  }

  getStatus() {
    return {
      ...this.botStatus,
      pendingFriends: this.pendingFriendRequests.size,
      pendingGifts: this.pendingGifts.size,
      retryQueueLength: this.retryQueue.length
    };
  }

  async shutdown() {
    logger.info('Bot shutting down...');
    this.client.logOff();
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    
    this.isLoggedIn = false;
    this.isReady = false;
    this.botStatus.online = false;
  }
}

// 创建单例
const steamBot = new SteamBot();

// 自动登录
setTimeout(() => {
  steamBot.login();
}, 5000);

module.exports = steamBot;
