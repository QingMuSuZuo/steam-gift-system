/**
 * Steam API 服务
 * 处理与Steam相关的API调用和数据解析
 */
const axios = require('axios');
const cheerio = require('cheerio');
const SteamID = require('steamid');
const config = require('../config/bot');
const logger = require('../utils/logger');

// Steam Web API密钥 (从配置文件获取)
const STEAM_API_KEY = config.apiKey;
const STEAM_API_URL = 'https://api.steampowered.com';

/**
 * Steam服务类
 * 提供各种与Steam平台交互的方法
 */
class SteamService {
  /**
   * 从各种格式的输入中提取Steam ID
   * 支持自定义URL、完整个人资料URL、Steam ID、Steam64位ID
   * 
   * @param {string} input - 用户输入的Steam标识信息
   * @returns {Promise<string>} - 返回Steam 64位ID
   */
  async extractSteamId(input) {
    try {
      input = input.trim();
      
      // 检查是否已经是有效的64位SteamID
      if (/^[0-9]{17}$/.test(input)) {
        // 验证SteamID有效性
        try {
          const steamId = new SteamID(input);
          if (steamId.isValid()) {
            return steamId.getSteamID64();
          }
        } catch (err) {
          logger.warn(`Invalid Steam64 ID format: ${input}`);
        }
      }
      
      // 检查是否是Steam个人资料URL
      const profileUrlMatch = input.match(/steamcommunity\.com\/(id|profiles)\/([^\/]+)/i);
      if (profileUrlMatch) {
        const urlType = profileUrlMatch[1].toLowerCase();
        const urlValue = profileUrlMatch[2];
        
        if (urlType === 'profiles' && /^[0-9]{17}$/.test(urlValue)) {
          // URL中直接包含64位ID
          return urlValue;
        } else if (urlType === 'id') {
          // 自定义URL，需要解析为SteamID
          return await this.resolveVanityUrl(urlValue);
        }
      }
      
      // 检查是否是Steam好友代码
      const friendCodeMatch = input.match(/^[A-Z0-9]{6,10}$/i);
      if (friendCodeMatch) {
        return await this.resolveFriendCode(input);
      }
      
      // 如果没有匹配任何已知格式，尝试作为自定义URL解析
      if (!/^https?:\/\//.test(input)) {
        return await this.resolveVanityUrl(input);
      }
      
      throw new Error('无法识别的Steam ID格式');
    } catch (error) {
      logger.error(`Steam ID extraction error: ${error.message}`, { input });
      throw new Error(`无法提取Steam ID: ${error.message}`);
    }
  }

  /**
   * 解析Steam自定义URL
   * 
   * @param {string} vanityUrl - Steam自定义URL名称
   * @returns {Promise<string>} - 返回Steam 64位ID
   */
  async resolveVanityUrl(vanityUrl) {
    try {
      const response = await axios.get(`${STEAM_API_URL}/ISteamUser/ResolveVanityURL/v1/`, {
        params: {
          key: STEAM_API_KEY,
          vanityurl: vanityUrl
        }
      });
      
      const data = response.data.response;
      
      if (data.success === 1) {
        return data.steamid;
      }
      
      throw new Error('找不到对应的Steam账号');
    } catch (error) {
      logger.error(`Vanity URL resolution error: ${error.message}`, { vanityUrl });
      throw new Error(`无法解析自定义URL: ${error.message}`);
    }
  }
  
  /**
   * 解析Steam好友代码
   * 
   * @param {string} friendCode - Steam好友代码
   * @returns {Promise<string>} - 返回Steam 64位ID
   */
  async resolveFriendCode(friendCode) {
    try {
      // 注意：Steam没有直接解析好友代码的公开API
      // 这里我们使用一个假设存在的API端点，实际实现可能需要不同的方法
      const response = await axios.get(`${STEAM_API_URL}/ISteamUser/GetFriendCodeInfo/v1/`, {
        params: {
          key: STEAM_API_KEY,
          friend_code: friendCode
        }
      });
      
      if (response.data && response.data.response && response.data.response.steamid) {
        return response.data.response.steamid;
      }
      
      // 如果上面的API不可用，可以考虑使用网页抓取
      return await this.resolveFriendCodeByScraping(friendCode);
    } catch (error) {
      logger.error(`Friend code resolution error: ${error.message}`, { friendCode });
      throw new Error(`无法解析好友代码: ${error.message}`);
    }
  }
  
  /**
   * 通过网页抓取解析Steam好友代码
   * 注意：这是一个后备方法，如果有官方API应优先使用
   * 
   * @param {string} friendCode - Steam好友代码
   * @returns {Promise<string>} - 返回Steam 64位ID
   */
  async resolveFriendCodeByScraping(friendCode) {
    try {
      const response = await axios.get(`https://steamcommunity.com/friends/search?friend_code=${friendCode}`);
      const $ = cheerio.load(response.data);
      
      // 尝试从搜索结果页面提取SteamID
      const profileLink = $('.search_row .searchPersonaName').attr('href');
      if (profileLink) {
        const profileMatch = profileLink.match(/steamcommunity\.com\/(id|profiles)\/([^\/]+)/i);
        if (profileMatch) {
          const urlType = profileMatch[1].toLowerCase();
          const urlValue = profileMatch[2];
          
          if (urlType === 'profiles' && /^[0-9]{17}$/.test(urlValue)) {
            return urlValue;
          } else if (urlType === 'id') {
            return await this.resolveVanityUrl(urlValue);
          }
        }
      }
      
      throw new Error('无法从好友代码获取Steam ID');
    } catch (error) {
      logger.error(`Friend code scraping error: ${error.message}`, { friendCode });
      throw new Error(`无法通过网页解析好友代码: ${error.message}`);
    }
  }

  /**
   * 获取Steam游戏详情
   * 
   * @param {string} appId - Steam游戏的AppID
   * @returns {Promise<Object>} - 返回游戏详情
   */
  async getGameDetails(appId) {
    try {
      const response = await axios.get(`https://store.steampowered.com/api/appdetails`, {
        params: {
          appids: appId,
          cc: 'us',  // 国家代码
          l: 'en'    // 语言
        }
      });
      
      const data = response.data;
      if (data && data[appId] && data[appId].success) {
        return data[appId].data;
      }
      
      throw new Error('无法获取游戏详情');
    } catch (error) {
      logger.error(`Game details fetch error: ${error.message}`, { appId });
      throw new Error(`无法获取游戏详情: ${error.message}`);
    }
  }
  
  /**
   * 通过Steam商店链接提取游戏信息
   * 
   * @param {string} storeUrl - Steam商店游戏链接
   * @returns {Promise<Object>} - 返回游戏信息（appId, name, imageUrl等）
   */
  async extractGameInfoFromUrl(storeUrl) {
    try {
      // 从URL中提取AppID
      const appIdMatch = storeUrl.match(/\/app\/(\d+)/i);
      if (!appIdMatch) {
        throw new Error('无效的Steam商店链接');
      }
      
      const appId = appIdMatch[1];
      
      // 获取游戏详情
      const gameDetails = await this.getGameDetails(appId);
      
      return {
        appId,
        name: gameDetails.name,
        imageUrl: gameDetails.header_image,
        price: gameDetails.price_overview ? gameDetails.price_overview.final / 100 : 0, // 价格转换为正确单位
        description: gameDetails.short_description,
        platforms: {
          windows: gameDetails.platforms.windows,
          mac: gameDetails.platforms.mac,
          linux: gameDetails.platforms.linux
        },
        releaseDate: gameDetails.release_date.date,
        developers: gameDetails.developers,
        publishers: gameDetails.publishers,
        categories: gameDetails.categories ? gameDetails.categories.map(c => c.description) : [],
        genres: gameDetails.genres ? gameDetails.genres.map(g => g.description) : []
      };
    } catch (error) {
      logger.error(`Game info extraction error: ${error.message}`, { storeUrl });
      throw new Error(`无法从商店链接提取游戏信息: ${error.message}`);
    }
  }
  
  /**
   * 检查Steam账户是否有效
   * 
   * @param {string} steamId - Steam 64位ID
   * @returns {Promise<boolean>} - 返回账户是否有效
   */
  async isSteamAccountValid(steamId) {
    try {
      const response = await axios.get(`${STEAM_API_URL}/ISteamUser/GetPlayerSummaries/v2/`, {
        params: {
          key: STEAM_API_KEY,
          steamids: steamId
        }
      });
      
      const players = response.data.response.players;
      return players && players.length > 0;
    } catch (error) {
      logger.error(`Steam account validation error: ${error.message}`, { steamId });
      return false;
    }
  }
  
  /**
   * 获取用户的Steam个人资料信息
   * 
   * @param {string} steamId - Steam 64位ID
   * @returns {Promise<Object>} - 返回用户个人资料信息
   */
  async getUserProfile(steamId) {
    try {
      const response = await axios.get(`${STEAM_API_URL}/ISteamUser/GetPlayerSummaries/v2/`, {
        params: {
          key: STEAM_API_KEY,
          steamids: steamId
        }
      });
      
      const players = response.data.response.players;
      if (players && players.length > 0) {
        return players[0];
      }
      
      throw new Error('找不到Steam用户资料');
    } catch (error) {
      logger.error(`User profile fetch error: ${error.message}`, { steamId });
      throw new Error(`无法获取用户资料: ${error.message}`);
    }
  }
  
  /**
   * 获取游戏是否可赠送 (是否支持作为礼物发送)
   * 
   * @param {string} appId - Steam游戏AppID
   * @returns {Promise<boolean>} - 返回游戏是否可以作为礼物发送
   */
  async isGameGiftable(appId) {
    try {
      const gameDetails = await this.getGameDetails(appId);
      
      // 检查游戏是否有不允许赠送的限制
      if (gameDetails.release_date && gameDetails.release_date.coming_soon) {
        return false; // 即将推出的游戏通常不能赠送
      }
      
      // 某些游戏类型可能不支持赠送
      if (gameDetails.type === 'dlc' || gameDetails.type === 'demo') {
        // 需要额外逻辑确认DLC是否可赠送
        return this.checkDlcGiftable(appId);
      }
      
      // 默认假设游戏可以赠送
      // 注意：这是一个简化的判断，实际Steam赠送规则可能更复杂
      return true;
    } catch (error) {
      logger.error(`Game giftable check error: ${error.message}`, { appId });
      return false; // 出错时假设不可赠送
    }
  }
  
  /**
   * 检查DLC是否可赠送
   * 
   * @param {string} appId - DLC的AppID
   * @returns {Promise<boolean>} - 返回DLC是否可以作为礼物发送
   */
  async checkDlcGiftable(appId) {
    // DLC赠送规则可能更复杂，这里是简化实现
    try {
      const response = await axios.get(`https://store.steampowered.com/app/${appId}`);
      const $ = cheerio.load(response.data);
      
      // 查找页面上的礼物购买按钮
      const hasGiftButton = $('.btn_addtocart .btn_green_steamui').length > 0;
      return hasGiftButton;
    } catch (error) {
      logger.error(`DLC giftable check error: ${error.message}`, { appId });
      return false;
    }
  }
}

module.exports = new SteamService();
