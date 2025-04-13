/**
 * Steam礼物系统 - 管理员控制器
 * 提供管理员登录、仪表盘、设置等功能
 */

const Admin = require('../models/admin');
const Game = require('../models/game');
const RedemptionCode = require('../models/redemptionCode');
const RedemptionRecord = require('../models/redemptionRecord');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { botStatus } = require('../services/botService');
const config = require('../config/auth');

// 登录页面渲染
exports.getLoginPage = (req, res) => {
  res.render('admin/login', {
    title: 'Steam礼物系统 - 管理员登录',
    error: null
  });
};

// 管理员登录处理
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 查找管理员账户
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.render('admin/login', { 
        title: 'Steam礼物系统 - 管理员登录',
        error: '用户名或密码不正确' 
      });
    }
    
    // 验证密码
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.render('admin/login', { 
        title: 'Steam礼物系统 - 管理员登录',
        error: '用户名或密码不正确' 
      });
    }
    
    // 生成JWT令牌
    const token = jwt.sign(
      { id: admin._id, username: admin.username },
      config.jwtSecret,
      { expiresIn: '24h' }
    );
    
    // 设置cookie
    res.cookie('adminToken', token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24小时
    });
    
    logger.info(`管理员 ${username} 登录成功`);
    res.redirect('/admin/dashboard');
  } catch (error) {
    logger.error(`管理员登录错误: ${error.message}`);
    res.render('admin/login', { 
      title: 'Steam礼物系统 - 管理员登录',
      error: '登录时发生错误，请稍后再试' 
    });
  }
};

// 退出登录
exports.logout = (req, res) => {
  res.clearCookie('adminToken');
  logger.info('管理员退出登录');
  res.redirect('/admin/login');
};

// 仪表盘页面
exports.getDashboard = async (req, res) => {
  try {
    // 获取系统状态数据
    const status = botStatus();
    
    // 统计数据
    const gameCount = await Game.countDocuments();
    const unusedCodesCount = await RedemptionCode.countDocuments({ isUsed: false });
    const pendingRedemptions = await RedemptionRecord.countDocuments({ 
      status: { $in: ['pending', 'friend_added'] } 
    });
    const completedRedemptions = await RedemptionRecord.countDocuments({ 
      status: 'completed' 
    });
    const failedRedemptions = await RedemptionRecord.countDocuments({ 
      status: 'failed' 
    });
    
    // 最近的提货记录
    const recentRecords = await RedemptionRecord.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('gameId', 'name customName');
    
    // 库存状态
    const lowStockGames = await Game.aggregate([
      {
        $lookup: {
          from: 'redemptioncodes',
          localField: '_id',
          foreignField: 'gameId',
          as: 'codes'
        }
      },
      {
        $project: {
          name: 1,
          customName: 1,
          unusedCodesCount: {
            $size: {
              $filter: {
                input: '$codes',
                as: 'code',
                cond: { $eq: ['$$code.isUsed', false] }
              }
            }
          }
        }
      },
      {
        $match: {
          unusedCodesCount: { $lt: 5 }
        }
      },
      {
        $sort: { unusedCodesCount: 1 }
      }
    ]);
    
    res.render('admin/dashboard', {
      title: 'Steam礼物系统 - 系统首页',
      admin: req.admin,
      status,
      stats: {
        gameCount,
        unusedCodesCount,
        pendingRedemptions,
        completedRedemptions,
        failedRedemptions
      },
      recentRecords,
      lowStockGames
    });
  } catch (error) {
    logger.error(`加载仪表盘错误: ${error.message}`);
    res.status(500).render('admin/error', {
      title: '错误',
      message: '加载系统首页时发生错误',
      error
    });
  }
};

// 设置页面
exports.getSettings = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select('-password');
    
    res.render('admin/settings', {
      title: 'Steam礼物系统 - 设置',
      admin,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    logger.error(`加载设置页面错误: ${error.message}`);
    res.status(500).render('admin/error', {
      title: '错误',
      message: '加载设置页面时发生错误',
      error
    });
  }
};

// 更新管理员资料
exports.updateProfile = async (req, res) => {
  try {
    const { email } = req.body;
    
    await Admin.findByIdAndUpdate(req.admin.id, {
      email,
      updatedAt: Date.now()
    });
    
    logger.info(`管理员 ${req.admin.username} 更新了个人信息`);
    res.redirect('/admin/settings?success=profile_updated');
  } catch (error) {
    logger.error(`更新管理员资料错误: ${error.message}`);
    res.redirect(`/admin/settings?error=${encodeURIComponent('更新资料失败')}`);
  }
};

// 修改密码
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    // 检查新密码匹配
    if (newPassword !== confirmPassword) {
      return res.redirect('/admin/settings?error=passwords_not_match');
    }
    
    // 验证当前密码
    const admin = await Admin.findById(req.admin.id);
    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      return res.redirect('/admin/settings?error=current_password_incorrect');
    }
    
    // 更新密码
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    await Admin.findByIdAndUpdate(req.admin.id, {
      password: hashedPassword,
      updatedAt: Date.now()
    });
    
    logger.info(`管理员 ${req.admin.username} 更新了密码`);
    res.redirect('/admin/settings?success=password_updated');
  } catch (error) {
    logger.error(`更新密码错误: ${error.message}`);
    res.redirect(`/admin/settings?error=${encodeURIComponent('密码更新失败')}`);
  }
};

// 初始化管理员账户
exports.initializeAdmin = async () => {
  try {
    const adminCount = await Admin.countDocuments();
    
    // 如果没有管理员账户，创建默认账户
    if (adminCount === 0) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      
      await Admin.create({
        username: 'admin',
        password: hashedPassword,
        email: 'admin@example.com',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      
      logger.info('创建了默认管理员账户');
    }
  } catch (error) {
    logger.error(`初始化管理员账户错误: ${error.message}`);
  }
};

// 获取系统状态 API
exports.getSystemStatus = async (req, res) => {
  try {
    const status = botStatus();
    const unusedCodesCount = await RedemptionCode.countDocuments({ isUsed: false });
    
    res.json({
      success: true,
      status,
      inventory: {
        unusedCodes: unusedCodesCount
      }
    });
  } catch (error) {
    logger.error(`获取系统状态错误: ${error.message}`);
    res.status(500).json({
      success: false,
      error: '获取系统状态失败'
    });
  }
};
