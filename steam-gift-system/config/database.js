const mongoose = require('mongoose');
const logger = require('../utils/logger');

// 数据库连接配置
const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/steam-gift-system';
const DB_OPTIONS = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  autoIndex: true, // 生产环境可设为false以提高性能
  connectTimeoutMS: 10000, // 连接超时
};

// 连接到数据库
const connectDB = async () => {
  try {
    const connection = await mongoose.connect(DB_URI, DB_OPTIONS);
    logger.info(`MongoDB 连接成功: ${connection.connection.host}`);
    return connection;
  } catch (error) {
    logger.error(`MongoDB 连接失败: ${error.message}`);
    process.exit(1);
  }
};

// 监听数据库连接事件
mongoose.connection.on('connected', () => {
  logger.info('Mongoose 已连接到数据库');
});

mongoose.connection.on('error', (err) => {
  logger.error(`Mongoose 连接出错: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose 连接已断开');
});

// 应用程序退出或收到终止信号时关闭数据库连接
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('Mongoose 连接已通过应用终止关闭');
  process.exit(0);
});

module.exports = {
  connectDB,
  mongoose,
};
