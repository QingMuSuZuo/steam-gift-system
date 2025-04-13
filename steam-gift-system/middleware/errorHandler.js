/**
 * Steam礼物系统 - 错误处理中间件
 * 统一处理应用程序中的错误，提供一致的错误响应格式
 */

const logger = require('../utils/logger');

// 自定义错误类型
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational; // 区分操作性错误和编程错误
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// 处理开发环境下的错误
const sendErrorDev = (err, req, res) => {
  // API 错误
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  }
  
  // 渲染错误页面
  return res.status(err.statusCode).render('public/error', {
    title: 'Something went wrong!',
    msg: err.message
  });
};

// 处理生产环境下的错误
const sendErrorProd = (err, req, res) => {
  // API 错误
  if (req.originalUrl.startsWith('/api')) {
    // 操作性错误，发送详细信息给客户端
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    }
    
    // 编程或未知错误，不泄露错误详情
    logger.error('ERROR 💥', err);
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong'
    });
  }
  
  // 渲染错误页面
  if (err.isOperational) {
    return res.status(err.statusCode).render('public/error', {
      title: 'Something went wrong!',
      msg: err.message
    });
  }
  
  // 编程或未知错误，不泄露错误详情
  logger.error('ERROR 💥', err);
  return res.status(500).render('public/error', {
    title: 'Something went wrong!',
    msg: 'Please try again later.'
  });
};

// 处理MongoDB重复键错误
const handleDuplicateFieldsDB = err => {
  const value = err.message.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400);
};

// 处理MongoDB验证错误
const handleValidationErrorDB = err => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

// 处理JWT令牌错误
const handleJWTError = () => 
  new AppError('Invalid token. Please log in again!', 401);

// 处理JWT令牌过期
const handleJWTExpiredError = () => 
  new AppError('Your token has expired! Please log in again.', 401);

// 主错误处理中间件
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err };
    error.message = err.message;
    
    // 处理特定类型的错误
    if (error.name === 'CastError') error = new AppError(`Invalid ${error.path}: ${error.value}`, 400);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    
    sendErrorProd(error, req, res);
  }
};

// 创建错误的异步处理包装器
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

module.exports = {
  AppError,
  errorHandler,
  catchAsync
};
