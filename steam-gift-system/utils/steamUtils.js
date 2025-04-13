/**
 * Steam 工具函数
 * 提供 Steam ID 解析、游戏信息获取和链接验证等功能
 */

const axios = require('axios');
const cheerio = require('cheerio');
const SteamID = require('steamid');
const logger = require('./logger');
const config = require('../config/bot');

/**
 * 从各种格式的输入中提取 Steam ID
 * 支持 Steam 个人资料链接、Steam 好友代码、Steam64 ID 等格式
 * 
 * @param {string} input - 用户输入的 Steam 标识符
 * @returns {Promise<object>} - 返回包含 steamID64 和 steamID 的对象
 * @throws {Error} - 如果无法解析 Steam ID 则抛出错误
 */
async function extractSteamID(input) {
  try {
    input = input.trim();
    
    // 直接检查是否为有效的 SteamID64
    if (/^[0-9]{17}$/.test(input)) {
      const steamID = new SteamID(input);
      if (steamID.isValid()) {
        return {
          steamID64: steamID.getSteamID64(),
          steamID: steamID.getSteam3RenderedID()
        };
      }
    }
    
    // 检查 Steam 好友代码（示例：STEAM_0:0:12345678）
    if (/^STEAM_[0-5]:[01]:\d+$/.test(input)) {
      try {
        const steamID = new SteamID(input);
        return {
          steamID64: steamID.getSteamID64(),
          steamID: input
        };
      } catch (error) {
        logger.error(`无效的 Steam 好友代码: ${input}`, error);
      }
    }
    
    // 尝试从自定义URL或完整个人资料链接中提取
    let profileUrl = input;
    
    // 检查是否是 vanity URL (自定义URL)
    if (!input.startsWith('http')) {
      if (input.startsWith('steamcommunity.com')) {
        profileUrl = `https://${input}`;
      } else {
        // 假定这是一个自定义 ID
        profileUrl = `https://steamcommunity.com/id/${input}`;
      }
    }
    
    // 从 URL 请求页面并提取 SteamID64
    const steamID64 = await getSteamIDFromProfileURL(profileUrl);
    if (steamID64) {
      const steamID = new SteamID(steamID64);
      return {
        steamID64: steamID64,
        steamID: steamID.getSteam3RenderedID()
      };
    }
    
    throw new Error('无法解析 Steam ID，请提供有效的 Steam 个人资料链接或 ID');
  } catch (error) {
    logger.error(`提取 Steam ID 失败: ${error.message}`, error);
    throw new Error(`无法识别 Steam ID: ${error.message}`);
  }
}

/**
 * 从个人资料 URL 获取 SteamID64
 * 
 * @param {string} profileUrl - Steam 个人资料 URL
 * @returns {Promise<string|null>} - 返回 SteamID64 或 null
 */
async function getSteamIDFromProfileURL(profileUrl) {
  try {
    const response = await axios.get(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // 尝试从页面元数据中提取 SteamID64
    let steamID64 = $('div[data-steamid]').attr('data-steamid');
    if (steamID64 && /^[0-9]{17}$/.test(steamID64)) {
      return steamID64;
    }
    
    // 尝试从个人资料链接中提取
    const profileDataElement = $('div.responsive_page_template_content').html();
    if (profileDataElement) {
      const match = profileDataElement.match(/g_steamID = "(\d+)"/);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // 尝试从其他可能的位置提取
    const anotherMatch = response.data.match(/steamid":"(\d+)"/);
    if (anotherMatch && anotherMatch[1]) {
      return anotherMatch[1];
    }
    
    return null;
  } catch (error) {
    logger.error(`从个人资料 URL 获取 SteamID 失败: ${profileUrl}`, error);
    return null;
  }
}

/**
 * 获取 Steam 游戏信息
 * 
 * @param {string} appUrl - Steam 游戏主页 URL
 * @returns {Promise<object>} - 返回游戏信息对象
 */
async function getSteamGameInfo(appUrl) {
  try {
    // 验证 URL 是否为有效的 Steam 游戏链接
    if (!isValidSteamAppUrl(appUrl)) {
      throw new Error('无效的 Steam 游戏链接');
    }
    
    // 从 URL 中提取 appId
    const appIdMatch = appUrl.match(/\/app\/(\d+)/);
    if (!appIdMatch || !appIdMatch[1]) {
      throw new Error('无法从链接中提取游戏 ID');
    }
    
    const appId = appIdMatch[1];
    
    // 获取游戏详情页面
    const response = await axios.get(appUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // 提取游戏信息
    const name = $('.apphub_AppName').text().trim();
    const imageUrl = $('.game_header_image_full').attr('src');
    
    // 尝试获取价格
    let price = '';
    const priceElement = $('.game_purchase_price').first();
    if (priceElement.length) {
      price = priceElement.text().trim();
    } else {
      const discountedPriceElement = $('.discount_final_price').first();
      if (discountedPriceElement.length) {
        price = discountedPriceElement.text().trim();
      }
    }
    
    // 尝试获取描述
    const description = $('.game_description_snippet').text().trim();
    
    return {
      appId,
      name,
      steamLink: appUrl,
      imageUrl,
      price: price || 'N/A',
      description: description || 'No description available.'
    };
  } catch (error) {
    logger.error(`获取 Steam 游戏信息失败: ${appUrl}`, error);
    throw new Error(`无法获取游戏信息: ${error.message}`);
  }
}

/**
 * 验证 Steam 应用 URL 是否有效
 * 
 * @param {string} url - 要验证的 URL
 * @returns {boolean} - 如果是有效的 Steam 应用 URL 则返回 true
 */
function isValidSteamAppUrl(url) {
  return /^https?:\/\/store\.steampowered\.com\/app\/\d+/.test(url);
}

/**
 * 验证 Steam 个人资料 URL 是否有效
 * 
 * @param {string} url - 要验证的 URL
 * @returns {boolean} - 如果是有效的 Steam 个人资料 URL 则返回 true
 */
function isValidSteamProfileUrl(url) {
  return /^https?:\/\/steamcommunity\.com\/(id\/[\w-]+|profiles\/\d+)/.test(url);
}

/**
 * 检查机器人是否已经添加了指定用户为好友
 * 
 * @param {object} steamClient - Steam 客户端实例
 * @param {string} steamID64 - 要检查的用户 SteamID64
 * @returns {boolean} - 如果已经是好友则返回 true
 */
function isFriendWithUser(steamClient, steamID64) {
  if (!steamClient || !steamClient.myFriends) {
    return false;
  }
  
  return steamClient.myFriends[steamID64] === 3; // 3 表示是好友关系
}

/**
 * 格式化 Steam 个人资料 URL
 * 
 * @param {string} steamID64 - 用户的 SteamID64
 * @returns {string} - 格式化后的个人资料 URL
 */
function formatSteamProfileUrl(steamID64) {
  return `https://steamcommunity.com/profiles/${steamID64}`;
}

/**
 * 在 Steam API 中搜索游戏
 * 
 * @param {string} searchTerm - 搜索关键词
 * @returns {Promise<Array>} - 返回搜索结果数组
 */
async function searchSteamGames(searchTerm) {
  try {
    const response = await axios.get('https://store.steampowered.com/api/storesearch', {
      params: {
        term: searchTerm,
        l: 'english',
        cc: 'US'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (response.data && response.data.items) {
      return response.data.items.map(item => ({
        appId: item.id,
        name: item.name,
        imageUrl: item.tiny_image,
        price: item.price ? item.price.final / 100 : 'N/A',
        steamLink: `https://store.steampowered.com/app/${item.id}`
      }));
    }
    
    return [];
  } catch (error) {
    logger.error(`Steam 游戏搜索失败: ${searchTerm}`, error);
    return [];
  }
}

/**
 * 检查 Steam 应用 ID 是否为可赠送的游戏
 * 
 * @param {string} appId - Steam 应用 ID
 * @returns {Promise<boolean>} - 如果可赠送则返回 true
 */
async function isGiftable(appId) {
  try {
    const response = await axios.get(`https://store.steampowered.com/api/appdetails`, {
      params: { appids: appId }
    });
    
    if (response.data && response.data[appId] && response.data[appId].success) {
      const data = response.data[appId].data;
      
      // 检查游戏是否有 "不可作为礼物" 的标记
      const notGiftable = data.release_date && data.release_date.coming_soon ||
                          data.type === 'demo' ||
                          data.is_free === true;
      
      return !notGiftable;
    }
    
    return false;
  } catch (error) {
    logger.error(`检查游戏是否可赠送失败: ${appId}`, error);
    return false;
  }
}

/**
 * 从 Steam 商店获取游戏当前价格
 * 
 * @param {string} appId - Steam 应用 ID
 * @returns {Promise<string>} - 返回格式化的价格字符串
 */
async function getGamePrice(appId) {
  try {
    const response = await axios.get(`https://store.steampowered.com/api/appdetails`, {
      params: { 
        appids: appId,
        cc: 'US',
        filters: 'price_overview'
      }
    });
    
    if (response.data && 
        response.data[appId] && 
        response.data[appId].success && 
        response.data[appId].data.price_overview) {
      
      const priceData = response.data[appId].data.price_overview;
      return priceData.final_formatted;
    }
    
    return 'N/A';
  } catch (error) {
    logger.error(`获取游戏价格失败: ${appId}`, error);
    return 'N/A';
  }
}

module.exports = {
  extractSteamID,
  getSteamGameInfo,
  isValidSteamAppUrl,
  isValidSteamProfileUrl,
  isFriendWithUser,
  formatSteamProfileUrl,
  searchSteamGames,
  isGiftable,
  getGamePrice
};
