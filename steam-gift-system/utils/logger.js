/**
 * Steam礼物系统 - 日志工具
 * 用于统一处理系统日志，支持不同级别的日志记录和格式化
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// 确保日志目录存在
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// 定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = JSON.stringify(meta);
    }
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
  })
);

// 创建Winston日志记录器
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'steam-gift-system' },
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // 错误日志文件
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // 所有日志文件
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    })
  ],
  // 当uncaughtException发生时不退出
  exitOnError: false
});

// 为每种日志级别创建简便方法
const loggerWrapper = {
  error: (message, meta = {}) => {
    logger.error(message, meta);
  },
  warn: (message, meta = {}) => {
    logger.warn(message, meta);
  },
  info: (message, meta = {}) => {
    logger.info(message, meta);
  },
  debug: (message, meta = {}) => {
    logger.debug(message, meta);
  },
  // Steam机器人专用日志
  bot: (message, meta = {}) => {
    logger.info(`[BOT] ${message}`, meta);
  },
  // 用户行为日志
  user: (message, meta = {}) => {
    logger.info(`[USER] ${message}`, meta);
  },
  // 管理员操作日志
  admin: (message, meta = {}) => {
    logger.info(`[ADMIN] ${message}`, meta);
  },
  // 系统级别日志
  system: (message, meta = {}) => {
    logger.info(`[SYSTEM] ${message}`, meta);
  },
  // 为Express请求创建中间件
  expressLogger: () => {
    return (req, res, next) => {
      // 请求开始时间
      const startTime = new Date();
      
      // 响应结束时记录日志
      res.on('finish', () => {
        const responseTime = new Date() - startTime;
        logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${responseTime}ms`, {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          responseTime
        });
      });
      
      next();
    };
  },
  // 捕获未处理的异常
  captureUncaughtExceptions: () => {
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error: error.stack || error.toString() });
    });
    
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', { reason: reason.stack || reason.toString() });
    });
  }
};

module.exports = loggerWrapper;
