// 引入必要的依赖
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const MongoStore = require('connect-mongo');

// 引入配置文件
const dbConfig = require('./config/database');
const botConfig = require('./config/bot');

// 引入路由
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');
const publicRoutes = require('./routes/public');

// 引入中间件
const errorHandler = require('./middleware/errorHandler');

// 引入服务
const botService = require('./services/botService');

// 创建Express应用
const app = express();

// 设置视图引擎
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// 应用中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "code.jquery.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "cdn.cloudflare.steamstatic.com", "*.steamcommunity.com"]
    }
  }
}));
app.use(compression());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true
}));

// 设置会话
app.use(session({
  secret: process.env.SESSION_SECRET || 'steam-gift-system-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: dbConfig.url,
    collectionName: 'sessions'
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
}));

// 连接数据库
mongoose.connect(dbConfig.url, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('数据库连接成功');
  
  // 初始化Steam机器人
  return botService.initialize(botConfig);
})
.then(() => {
  console.log('Steam机器人初始化成功');
})
.catch(err => {
  console.error('应用启动错误:', err);
  process.exit(1);
});

// 设置全局变量供视图使用
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.botStatus = botService.getStatus();
  next();
});

// 应用路由
app.use('/', publicRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// 404处理
app.use((req, res, next) => {
  const err = new Error('页面未找到');
  err.status = 404;
  next(err);
});

// 错误处理
app.use(errorHandler);

// 设置端口
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});

// 优雅退出
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('正在关闭应用...');
  botService.shutdown()
    .then(() => {
      console.log('Steam机器人已安全关闭');
      return mongoose.connection.close();
    })
    .then(() => {
      console.log('数据库连接已关闭');
      process.exit(0);
    })
    .catch(err => {
      console.error('关闭过程中出错:', err);
      process.exit(1);
    });
}

module.exports = app;
