/**
 * 认证配置文件
 * 包含JWT配置和管理员认证相关设置
 */

const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

module.exports = {
  // JWT配置
  jwt: {
    // JWT密钥，推荐使用环境变量存储
    secret: process.env.JWT_SECRET || 'steam-gift-system-secret-key',
    // Token过期时间（默认24小时）
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    // 刷新token过期时间（默认7天）
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    // 是否允许刷新token
    allowRefresh: true,
    // cookie设置
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24小时
    }
  },
  
  // 密码策略
  password: {
    // bcrypt加密的盐轮数
    saltRounds: 10,
    // 最小密码长度
    minLength: 8,
    // 密码复杂度要求（可选）
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true
  },
  
  // 会话配置
  session: {
    // 会话名称
    name: 'steam_gift_session',
    // 会话密钥
    secret: process.env.SESSION_SECRET || 'steam-gift-session-secret',
    // 会话配置
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24小时
    }
  },
  
  // 安全配置
  security: {
    // 登录限制
    loginAttempts: {
      // 最大尝试次数
      maxAttempts: 5,
      // 锁定时间（分钟）
      lockDuration: 30
    },
    // 请求限制
    rateLimit: {
      // 时间窗口（毫秒）
      windowMs: 15 * 60 * 1000, // 15分钟
      // 在时间窗口内允许的最大请求数
      max: 100,
      // 是否将限流标头添加到响应中
      standardHeaders: true,
      // 限流时的响应消息
      message: '请求过于频繁，请稍后再试'
    },
    // CSRF保护
    csrf: {
      enabled: true,
      // CSRF cookie设置
      cookie: {
        key: '_csrf',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  },
  
  // 管理员账户默认设置
  adminDefaults: {
    // 默认管理员用户名
    username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
    // 默认管理员密码（仅用于初始化，应当立即更改）
    password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123456',
    // 默认管理员邮箱
    email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com'
  },
  
  // 管理员会话相关路径
  paths: {
    // 登录页面路径
    login: '/admin/login',
    // 登录成功后重定向路径
    afterLogin: '/admin/dashboard',
    // 登出后重定向路径
    afterLogout: '/admin/login'
  }
};
