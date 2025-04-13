const Game = require('../models/game');
const RedemptionCode = require('../models/redemptionCode');
const RedemptionRecord = require('../models/redemptionRecord');
const steamService = require('../services/steamService');
const codeGenerator = require('../utils/codeGenerator');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

/**
 * 渲染游戏管理页面
 */
exports.getGamesPage = async (req, res) => {
  try {
    const searchTerm = req.query.search || '';
    let query = {};
    
    if (searchTerm) {
      query = {
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { customName: { $regex: searchTerm, $options: 'i' } },
          { appId: { $regex: searchTerm, $options: 'i' } }
        ]
      };
    }
    
    const games = await Game.find(query).sort({ createdAt: -1 });
    
    res.render('admin/games', {
      title: '游戏管理',
      games,
      searchTerm,
      user: req.user
    });
  } catch (error) {
    logger.error(`获取游戏列表失败: ${error.message}`);
    res.status(500).render('admin/games', {
      title: '游戏管理',
      games: [],
      searchTerm: '',
      error: '获取游戏列表失败',
      user: req.user
    });
  }
};

/**
 * 添加新游戏
 */
exports.addGame = async (req, res) => {
  try {
    const { steamLink, customName, imageUrl, isCustomImage, price, description } = req.body;
    
    // 验证必填字段
    if (!steamLink) {
      return res.status(400).json({ success: false, message: 'Steam游戏链接为必填项' });
    }
    
    // 从Steam链接中获取游戏信息
    let gameInfo;
    try {
      gameInfo = await steamService.getGameInfoFromUrl(steamLink);
    } catch (error) {
      logger.error(`从Steam获取游戏信息失败: ${error.message}`);
      return res.status(400).json({ success: false, message: '无法从Steam链接获取游戏信息，请检查链接是否正确' });
    }
    
    // 检查游戏是否已存在
    const existingGame = await Game.findOne({ appId: gameInfo.appId });
    if (existingGame) {
      return res.status(400).json({ success: false, message: '该游戏已存在于系统中' });
    }
    
    // 创建新游戏
    const newGame = new Game({
      name: gameInfo.name,
      steamLink,
      customName: customName || gameInfo.name,
      imageUrl: isCustomImage ? imageUrl : gameInfo.imageUrl,
      isCustomImage: !!isCustomImage,
      price: price || gameInfo.price,
      description: description || gameInfo.description,
      appId: gameInfo.appId
    });
    
    await newGame.save();
    
    logger.info(`新游戏添加成功: ${newGame.name} (${newGame.appId})`);
    res.status(201).json({
      success: true,
      message: '游戏添加成功',
      game: newGame
    });
  } catch (error) {
    logger.error(`添加游戏失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `添加游戏失败: ${error.message}`
    });
  }
};

/**
 * 更新游戏信息
 */
exports.updateGame = async (req, res) => {
  try {
    const { id } = req.params;
    const { customName, imageUrl, isCustomImage, price, description } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: '无效的游戏ID' });
    }
    
    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({ success: false, message: '未找到指定游戏' });
    }
    
    // 更新游戏信息
    if (customName) game.customName = customName;
    if (imageUrl && isCustomImage) game.imageUrl = imageUrl;
    if (isCustomImage !== undefined) game.isCustomImage = isCustomImage;
    if (price) game.price = price;
    if (description) game.description = description;
    
    game.updatedAt = new Date();
    await game.save();
    
    logger.info(`游戏信息更新成功: ${game.name} (${game.appId})`);
    res.json({
      success: true,
      message: '游戏信息更新成功',
      game
    });
  } catch (error) {
    logger.error(`更新游戏信息失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `更新游戏信息失败: ${error.message}`
    });
  }
};

/**
 * A删除游戏
 */
exports.deleteGame = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: '无效的游戏ID' });
    }
    
    // 检查游戏是否存在
    const game = await Game.findById(id).session(session);
    if (!game) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: '未找到指定游戏' });
    }
    
    // 检查是否存在未使用的提货码
    const unusedCodesCount = await RedemptionCode.countDocuments({ 
      gameId: id,
      isUsed: false
    }).session(session);
    
    if (unusedCodesCount > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `该游戏还有${unusedCodesCount}个未使用的提货码，不能删除`
      });
    }
    
    // 删除游戏关联的所有提货码（已使用的）
    await RedemptionCode.deleteMany({ gameId: id }).session(session);
    
    // 删除游戏
    await Game.findByIdAndDelete(id).session(session);
    
    await session.commitTransaction();
    session.endSession();
    
    logger.info(`游戏删除成功: ${game.name} (${game.appId})`);
    res.json({
      success: true,
      message: '游戏删除成功'
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    logger.error(`删除游戏失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `删除游戏失败: ${error.message}`
    });
  }
};

/**
 * 获取游戏详情
 */
exports.getGameDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: '无效的游戏ID' });
    }
    
    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({ success: false, message: '未找到指定游戏' });
    }
    
    // 获取提货码统计信息
    const totalCodes = await RedemptionCode.countDocuments({ gameId: id });
    const usedCodes = await RedemptionCode.countDocuments({ gameId: id, isUsed: true });
    const availableCodes = totalCodes - usedCodes;
    
    res.json({
      success: true,
      game,
      stats: {
        totalCodes,
        usedCodes,
        availableCodes
      }
    });
  } catch (error) {
    logger.error(`获取游戏详情失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `获取游戏详情失败: ${error.message}`
    });
  }
};

/**
 * 获取游戏提货码列表页面
 */
exports.getGameCodesPage = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const filter = req.query.filter || 'all'; // all, used, unused
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).render('admin/error', {
        title: '错误',
        message: '无效的游戏ID',
        user: req.user
      });
    }
    
    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).render('admin/error', {
        title: '错误',
        message: '未找到指定游戏',
        user: req.user
      });
    }
    
    // 构建查询条件
    let query = { gameId: id };
    if (filter === 'used') {
      query.isUsed = true;
    } else if (filter === 'unused') {
      query.isUsed = false;
    }
    
    // 计算分页
    const totalCodes = await RedemptionCode.countDocuments(query);
    const totalPages = Math.ceil(totalCodes / limit);
    const skip = (page - 1) * limit;
    
    // 获取提货码
    const codes = await RedemptionCode.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // 统计信息
    const totalUnusedCodes = await RedemptionCode.countDocuments({ gameId: id, isUsed: false });
    
    res.render('admin/codes', {
      title: `${game.customName || game.name} - 提货码管理`,
      game,
      codes,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: totalCodes
      },
      filter,
      stats: {
        totalCodes,
        availableCodes: totalUnusedCodes
      },
      user: req.user
    });
  } catch (error) {
    logger.error(`获取游戏提货码失败: ${error.message}`);
    res.status(500).render('admin/error', {
      title: '错误',
      message: `获取游戏提货码失败: ${error.message}`,
      user: req.user
    });
  }
};

/**
 * 生成游戏提货码
 */
exports.generateCodes = async (req, res) => {
  try {
    const { id } = req.params;
    const { count } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: '无效的游戏ID' });
    }
    
    // 验证数量
    const codeCount = parseInt(count);
    if (isNaN(codeCount) || codeCount <= 0 || codeCount > 1000) {
      return res.status(400).json({
        success: false,
        message: '请提供有效的提货码数量（1-1000之间）'
      });
    }
    
    // 检查游戏是否存在
    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({ success: false, message: '未找到指定游戏' });
    }
    
    // 生成提货码
    const generatedCodes = [];
    const existingCodes = new Set(
      (await RedemptionCode.find({}, 'code')).map(c => c.code)
    );
    
    for (let i = 0; i < codeCount; i++) {
      let newCode;
      let attempts = 0;
      const maxAttempts = 10;
      
      // 生成不重复的提货码
      do {
        newCode = codeGenerator.generateRedemptionCode();
        attempts++;
        
        if (attempts >= maxAttempts) {
          return res.status(500).json({
            success: false,
            message: '无法生成足够的唯一提货码，请稍后再试'
          });
        }
      } while (existingCodes.has(newCode));
      
      existingCodes.add(newCode);
      
      generatedCodes.push({
        code: newCode,
        gameId: id,
        isUsed: false,
        createdAt: new Date()
      });
    }
    
    // 批量保存提货码
    await RedemptionCode.insertMany(generatedCodes);
    
    logger.info(`成功为游戏 ${game.name} 生成 ${codeCount} 个提货码`);
    res.status(201).json({
      success: true,
      message: `成功生成 ${codeCount} 个提货码`,
      count: codeCount
    });
  } catch (error) {
    logger.error(`生成提货码失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `生成提货码失败: ${error.message}`
    });
  }
};

/**
 * 导出游戏提货码
 */
exports.exportCodes = async (req, res) => {
  try {
    const { id } = req.params;
    const { filter } = req.query; // all, used, unused
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: '无效的游戏ID' });
    }
    
    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({ success: false, message: '未找到指定游戏' });
    }
    
    // 构建查询条件
    let query = { gameId: id };
    if (filter === 'used') {
      query.isUsed = true;
    } else if (filter === 'unused') {
      query.isUsed = false;
    }
    
    // 获取提货码
    const codes = await RedemptionCode.find(query).sort({ createdAt: -1 });
    
    // 准备CSV数据
    const gameName = game.customName || game.name;
    let csv = '提货码,游戏名称,状态,创建时间,使用时间\n';
    
    codes.forEach(code => {
      const status = code.isUsed ? '已使用' : '未使用';
      const createdAt = code.createdAt.toISOString().split('T')[0];
      const usedAt = code.usedAt ? code.usedAt.toISOString().split('T')[0] : '';
      
      csv += `${code.code},"${gameName}",${status},${createdAt},${usedAt}\n`;
    });
    
    // 设置文件名
    const fileName = `${gameName}_提货码_${new Date().toISOString().split('T')[0]}.csv`;
    
    // 设置响应头
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(fileName)}`);
    
    // 发送CSV数据
    res.send(csv);
  } catch (error) {
    logger.error(`导出提货码失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `导出提货码失败: ${error.message}`
    });
  }
};

/**
 * 删除提货码
 */
exports.deleteCode = async (req, res) => {
  try {
    const { codeId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(codeId)) {
      return res.status(400).json({ success: false, message: '无效的提货码ID' });
    }
    
    const code = await RedemptionCode.findById(codeId);
    if (!code) {
      return res.status(404).json({ success: false, message: '未找到指定提货码' });
    }
    
    // 检查提货码是否已被使用
    if (code.isUsed) {
      return res.status(400).json({
        success: false,
        message: '无法删除已使用的提货码'
      });
    }
    
    // 删除提货码
    await RedemptionCode.findByIdAndDelete(codeId);
    
    logger.info(`提货码 ${code.code} 已被删除`);
    res.json({
      success: true,
      message: '提货码删除成功'
    });
  } catch (error) {
    logger.error(`删除提货码失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `删除提货码失败: ${error.message}`
    });
  }
};

/**
 * 批量删除未使用提货码
 */
exports.bulkDeleteUnusedCodes = async (req, res) => {
  try {
    const { id } = req.params; // 游戏ID
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: '无效的游戏ID' });
    }
    
    // 检查游戏是否存在
    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({ success: false, message: '未找到指定游戏' });
    }
    
    // 删除所有未使用的提货码
    const result = await RedemptionCode.deleteMany({
      gameId: id,
      isUsed: false
    });
    
    logger.info(`已批量删除游戏 ${game.name} 的 ${result.deletedCount} 个未使用提货码`);
    res.json({
      success: true,
      message: `成功删除 ${result.deletedCount} 个未使用提货码`,
      count: result.deletedCount
    });
  } catch (error) {
    logger.error(`批量删除提货码失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `批量删除提货码失败: ${error.message}`
    });
  }
};

/**
 * 从Steam获取游戏信息预览
 */
exports.previewGameInfo = async (req, res) => {
  try {
    const { steamLink } = req.body;
    
    if (!steamLink) {
      return res.status(400).json({
        success: false,
        message: '请提供Steam游戏链接'
      });
    }
    
    // 调用Steam服务获取游戏信息
    const gameInfo = await steamService.getGameInfoFromUrl(steamLink);
    
    res.json({
      success: true,
      gameInfo
    });
  } catch (error) {
    logger.error(`预览游戏信息失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `无法获取游戏信息: ${error.message}`
    });
  }
};
