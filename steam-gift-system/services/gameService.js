/**
 * Game Service
 * 处理游戏管理相关的业务逻辑
 */
const axios = require('axios');
const cheerio = require('cheerio');
const Game = require('../models/game');
const RedemptionCode = require('../models/redemptionCode');
const RedemptionRecord = require('../models/redemptionRecord');
const codeGenerator = require('../utils/codeGenerator');
const logger = require('../utils/logger');

/**
 * 从Steam链接获取游戏信息
 * @param {string} steamLink - Steam游戏主页链接
 * @returns {Promise<Object>} 游戏信息对象
 */
async function fetchGameInfoFromSteam(steamLink) {
  try {
    const response = await axios.get(steamLink);
    const $ = cheerio.load(response.data);
    
    // 提取游戏名称
    const name = $('.apphub_AppName').text().trim();
    
    // 提取游戏图片
    const imageUrl = $('.game_header_image_full').attr('src');
    
    // 提取游戏价格
    const priceStr = $('.game_purchase_price').first().text().trim();
    const price = parseFloat(priceStr.replace(/[^\d.]/g, '')) || 0;
    
    // 提取游戏描述
    const description = $('.game_description_snippet').text().trim();
    
    // 从URL提取AppID
    const appIdMatch = steamLink.match(/\/app\/(\d+)/);
    const appId = appIdMatch ? appIdMatch[1] : '';
    
    return { name, imageUrl, price, description, appId };
  } catch (error) {
    logger.error(`获取Steam游戏信息失败: ${error.message}`, { steamLink, error });
    throw new Error(`无法从Steam获取游戏信息: ${error.message}`);
  }
}

/**
 * 创建新游戏
 * @param {Object} gameData - 游戏数据
 * @returns {Promise<Object>} 创建的游戏对象
 */
async function createGame(gameData) {
  try {
    // 如果提供了Steam链接，获取游戏信息
    if (gameData.steamLink && !gameData.isCustom) {
      const steamInfo = await fetchGameInfoFromSteam(gameData.steamLink);
      
      // 合并信息，但允许自定义值覆盖自动获取的值
      gameData = {
        ...steamInfo,
        ...gameData,
        // 确保以下字段只在未提供时使用Steam获取的数据
        name: gameData.name || steamInfo.name,
        imageUrl: gameData.imageUrl || steamInfo.imageUrl,
        price: gameData.price || steamInfo.price,
        description: gameData.description || steamInfo.description,
      };
    }
    
    const game = new Game({
      name: gameData.name,
      steamLink: gameData.steamLink,
      customName: gameData.customName || '',
      imageUrl: gameData.imageUrl,
      isCustomImage: gameData.isCustomImage || false,
      price: gameData.price || 0,
      description: gameData.description || '',
      appId: gameData.appId || '',
    });
    
    return await game.save();
  } catch (error) {
    logger.error(`创建游戏失败: ${error.message}`, { gameData, error });
    throw error;
  }
}

/**
 * 更新游戏信息
 * @param {string} gameId - 游戏ID
 * @param {Object} updateData - 更新数据
 * @returns {Promise<Object>} 更新后的游戏对象
 */
async function updateGame(gameId, updateData) {
  try {
    // 如果链接变更，重新获取Steam信息
    if (updateData.steamLink && !updateData.isCustom) {
      try {
        const steamInfo = await fetchGameInfoFromSteam(updateData.steamLink);
        
        // 只在未提供自定义值时使用获取的Steam数据
        if (!updateData.name) updateData.name = steamInfo.name;
        if (!updateData.imageUrl) updateData.imageUrl = steamInfo.imageUrl;
        if (!updateData.price) updateData.price = steamInfo.price;
        if (!updateData.description) updateData.description = steamInfo.description;
        if (!updateData.appId) updateData.appId = steamInfo.appId;
      } catch (err) {
        logger.warn(`更新游戏时无法获取Steam信息: ${err.message}`, { gameId, steamLink: updateData.steamLink });
        // 继续使用提供的更新数据
      }
    }
    
    const game = await Game.findByIdAndUpdate(
      gameId,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    
    if (!game) {
      throw new Error('游戏不存在');
    }
    
    return game;
  } catch (error) {
    logger.error(`更新游戏失败: ${error.message}`, { gameId, updateData, error });
    throw error;
  }
}

/**
 * 删除游戏
 * @param {string} gameId - 游戏ID
 * @returns {Promise<boolean>} 是否成功删除
 */
async function deleteGame(gameId) {
  try {
    // 检查是否有与游戏关联的未使用提货码
    const unusedCodes = await RedemptionCode.countDocuments({ 
      gameId: gameId,
      isUsed: false 
    });
    
    if (unusedCodes > 0) {
      throw new Error(`无法删除游戏，存在${unusedCodes}个未使用的提货码`);
    }
    
    // 检查是否有进行中的提货记录
    const pendingRecords = await RedemptionRecord.countDocuments({
      gameId: gameId,
      status: { $in: ['pending', 'friend_added'] }
    });
    
    if (pendingRecords > 0) {
      throw new Error(`无法删除游戏，存在${pendingRecords}个进行中的提货记录`);
    }
    
    const result = await Game.findByIdAndDelete(gameId);
    
    if (!result) {
      throw new Error('游戏不存在');
    }
    
    return true;
  } catch (error) {
    logger.error(`删除游戏失败: ${error.message}`, { gameId, error });
    throw error;
  }
}

/**
 * 获取所有游戏
 * @param {Object} filter - 过滤条件
 * @param {Object} options - 分页和排序选项
 * @returns {Promise<Array>} 游戏列表
 */
async function getAllGames(filter = {}, options = {}) {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sort = { createdAt: -1 },
      search = ''
    } = options;
    
    // 构建查询条件
    const query = { ...filter };
    
    // 添加搜索条件
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { customName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // 获取游戏总数
    const total = await Game.countDocuments(query);
    
    // 获取游戏列表
    const games = await Game.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);
      
    // 获取每个游戏的提货码数量
    const gamesWithCounts = await Promise.all(games.map(async (game) => {
      const totalCodes = await RedemptionCode.countDocuments({ gameId: game._id });
      const unusedCodes = await RedemptionCode.countDocuments({ gameId: game._id, isUsed: false });
      
      return {
        ...game.toObject(),
        totalCodes,
        unusedCodes
      };
    }));
    
    return {
      games: gamesWithCounts,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    logger.error(`获取游戏列表失败: ${error.message}`, { filter, options, error });
    throw error;
  }
}

/**
 * 获取单个游戏
 * @param {string} gameId - 游戏ID
 * @returns {Promise<Object>} 游戏对象
 */
async function getGameById(gameId) {
  try {
    const game = await Game.findById(gameId);
    
    if (!game) {
      throw new Error('游戏不存在');
    }
    
    // 获取提货码数量
    const totalCodes = await RedemptionCode.countDocuments({ gameId: game._id });
    const unusedCodes = await RedemptionCode.countDocuments({ gameId: game._id, isUsed: false });
    
    return {
      ...game.toObject(),
      totalCodes,
      unusedCodes
    };
  } catch (error) {
    logger.error(`获取游戏失败: ${error.message}`, { gameId, error });
    throw error;
  }
}

/**
 * 生成提货码
 * @param {string} gameId - 游戏ID
 * @param {number} count - 生成数量
 * @returns {Promise<Array>} 生成的提货码列表
 */
async function generateRedemptionCodes(gameId, count) {
  try {
    // 检查游戏是否存在
    const game = await Game.findById(gameId);
    if (!game) {
      throw new Error('游戏不存在');
    }
    
    // 生成提货码
    const codes = [];
    const existingCodes = new Set(
      (await RedemptionCode.find({}, 'code')).map(c => c.code)
    );
    
    for (let i = 0; i < count; i++) {
      let code;
      let attempts = 0;
      const maxAttempts = 10; // 防止无限循环
      
      // 确保生成唯一提货码
      do {
        code = codeGenerator.generate();
        attempts++;
        
        if (attempts > maxAttempts) {
          throw new Error('无法生成唯一提货码，请稍后再试');
        }
      } while (existingCodes.has(code));
      
      existingCodes.add(code);
      codes.push(code);
    }
    
    // 批量创建提货码记录
    const codeDocuments = codes.map(code => ({
      code,
      gameId,
      isUsed: false,
      createdAt: new Date()
    }));
    
    await RedemptionCode.insertMany(codeDocuments);
    
    return codes;
  } catch (error) {
    logger.error(`生成提货码失败: ${error.message}`, { gameId, count, error });
    throw error;
  }
}

/**
 * 获取游戏的提货码
 * @param {string} gameId - 游戏ID
 * @param {Object} options - 分页和过滤选项
 * @returns {Promise<Object>} 提货码列表和分页信息
 */
async function getGameRedemptionCodes(gameId, options = {}) {
  try {
    const { 
      page = 1, 
      limit = 50, 
      isUsed = null,
      sort = { createdAt: -1 }
    } = options;
    
    // 构建查询条件
    const query = { gameId };
    if (isUsed !== null) {
      query.isUsed = isUsed;
    }
    
    // 获取提货码总数
    const total = await RedemptionCode.countDocuments(query);
    
    // 获取提货码列表
    const codes = await RedemptionCode.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);
    
    // 获取游戏信息
    const game = await Game.findById(gameId, 'name customName');
    
    return {
      game: game ? { 
        _id: gameId, 
        name: game.customName || game.name 
      } : null,
      codes,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    logger.error(`获取游戏提货码失败: ${error.message}`, { gameId, options, error });
    throw error;
  }
}

/**
 * 获取系统状态信息
 * @returns {Promise<Object>} 系统状态信息
 */
async function getSystemStatus() {
  try {
    // 获取游戏总数
    const totalGames = await Game.countDocuments();
    
    // 获取未使用提货码数量
    const unusedCodes = await RedemptionCode.countDocuments({ isUsed: false });
    
    // 获取库存状态（有未使用提货码的游戏数量）
    const gamesWithCodes = await RedemptionCode.distinct('gameId', { isUsed: false });
    
    // 获取近7天的提货记录数量
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentRedemptions = await RedemptionRecord.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });
    
    // 获取成功和失败的提货记录数量
    const successfulRedemptions = await RedemptionRecord.countDocuments({
      status: 'completed'
    });
    
    const failedRedemptions = await RedemptionRecord.countDocuments({
      status: 'failed'
    });
    
    return {
      totalGames,
      unusedCodes,
      gamesWithStock: gamesWithCodes.length,
      recentRedemptions,
      successfulRedemptions,
      failedRedemptions,
      systemStatus: 'normal', // 可根据具体条件设置
      lastUpdated: new Date()
    };
  } catch (error) {
    logger.error(`获取系统状态失败: ${error.message}`, { error });
    throw error;
  }
}

module.exports = {
  fetchGameInfoFromSteam,
  createGame,
  updateGame,
  deleteGame,
  getAllGames,
  getGameById,
  generateRedemptionCodes,
  getGameRedemptionCodes,
  getSystemStatus
};
