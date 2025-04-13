/**
 * 认证中间件
 * 用于验证管理员身份和保护管理后台API
 */
const jwt = require('jsonwebtoken');
const config = require('../config/auth');
const Admin = require('../models/admin');
const logger = require('../utils/logger');

/**
 * 验证用户是否已登录
 * 检查请求中的JWT令牌并验证其有效性
 */
const verifyToken = (req, res, next) => {
  // 从cookie或Authorization头获取token
  const token = req.cookies.jwt || 
                (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  
  if (!token) {
    return res.redirect('/admin/login');
  }

  try {
    // 验证令牌
    const decoded = jwt.verify(token, config.jwtSecret);
    
    // 将用户ID添加到请求对象
    req.userId = decoded.id;
    next();
  } catch (error) {
    logger.error(`认证失败: ${error.message}`);
    res.clearCookie('jwt');
    return res.redirect('/admin/login');
  }
};

/**
 * 加载当前登录的管理员信息
 * 根据令牌中的ID查询数据库获取完整管理员信息
 */
const loadUser = async (req, res, next) => {
  if (!req.userId) {
    return next();
  }

  try {
    const admin = await Admin.findById(req.userId).select('-password');
    if (!admin) {
      res.clearCookie('jwt');
      return res.redirect('/admin/login');
    }
    
    req.admin = admin;
    res.locals.admin = admin; // 使管理员信息在视图中可用
    next();
  } catch (error) {
    logger.error(`加载用户信息失败: ${error.message}`);
    return next(error);
  }
};

/**
 * 检查API请求的令牌
 * 用于API端点的验证，返回JSON响应而不是重定向
 */
const verifyApiToken = (req, res, next) => {
  const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: '未提供认证令牌' 
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.userId = decoded.id;
    next();
  } catch (error) {
    logger.error(`API认证失败: ${error.message}`);
    return res.status(401).json({ 
      success: false, 
      message: '无效的认证令牌' 
    });
  }
};

/**
 * 限制API请求频率
 * 防止暴力破解和DoS攻击
 */
const rateLimiter = {
  windowMs: 15 * 60 * 1000, // 15分钟窗口
  maxRequests: 100, // 每个IP最多100个请求
  message: '请求过于频繁，请稍后再试',
  requestMap: new Map(),
  
  // 检查和更新请求计数
  check(req, res, next) {
    const ip = req.ip;
    const currentTime = Date.now();
    
    if (!this.requestMap.has(ip)) {
      this.requestMap.set(ip, {
        count: 1,
        resetTime: currentTime + this.windowMs
      });
      return next();
    }
    
    const requestData = this.requestMap.get(ip);
    
    // 如果已经超过重置时间，重置计数
    if (currentTime > requestData.resetTime) {
      requestData.count = 1;
      requestData.resetTime = currentTime + this.windowMs;
      return next();
    }
    
    // 如果请求数超过限制，拒绝请求
    if (requestData.count >= this.maxRequests) {
      logger.warn(`IP ${ip} 请求频率超限`);
      return res.status(429).json({
        success: false,
        message: this.message
      });
    }
    
    // 更新请求计数
    requestData.count++;
    next();
  }
};

/**
 * 清理过期的请求记录
 * 定期运行以防止内存泄漏
 */
setInterval(() => {
  const currentTime = Date.now();
  for (const [ip, data] of rateLimiter.requestMap.entries()) {
    if (currentTime > data.resetTime) {
      rateLimiter.requestMap.delete(ip);
    }
  }
}, 60 * 1000); // 每分钟清理一次

/**
 * 确保HTTPS连接
 * 在生产环境中强制使用安全连接
 */
const ensureSecure = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
};

module.exports = {
  verifyToken,
  loadUser,
  verifyApiToken,
  rateLimit: (req, res, next) => rateLimiter.check(req, res, next),
  ensureSecure
};
