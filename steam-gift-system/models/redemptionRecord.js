const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * 提货记录模型 - 记录用户提货的全过程
 */
const redemptionRecordSchema = new Schema({
  // 使用的提货码
  code: {
    type: String,
    required: true,
    index: true
  },
  
  // 关联的游戏ID
  gameId: {
    type: Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  
  // 用户的Steam信息
  steamId: {
    type: String,
    required: true
  },
  
  // 用户提供的Steam URL或好友代码
  steamUrl: {
    type: String,
    required: true
  },
  
  // 解析后的Steam ID
  parsedSteamId: {
    type: String
  },
  
  // 提货状态
  // pending: 初始状态，等待处理
  // friend_request_sent: 已发送好友请求
  // friend_added: 已添加为好友
  // gift_started: 开始发送礼物
  // gift_sent: 礼物已发送
  // completed: 完成
  // failed: 失败
  status: {
    type: String,
    enum: ['pending', 'friend_request_sent', 'friend_added', 'gift_started', 'gift_sent', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  
  // 错误消息，当status为failed时使用
  errorMessage: {
    type: String
  },
  
  // 处理次数，用于跟踪重试
  attempts: {
    type: Number,
    default: 0
  },
  
  // 创建时间
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // 更新时间
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // 完成时间
  completedAt: {
    type: Date
  },
  
  // 处理记录 - 记录每一步的状态变更
  processLogs: [{
    status: String,
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
});

// 更新前自动更新updatedAt字段
redemptionRecordSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // 如果状态变更为completed或failed，记录完成时间
  if ((this.isModified('status') && 
      (this.status === 'completed' || this.status === 'failed')) &&
      !this.completedAt) {
    this.completedAt = Date.now();
  }
  
  next();
});

// 添加状态日志的实例方法
redemptionRecordSchema.methods.addLog = function(status, message) {
  this.processLogs.push({
    status,
    message,
    timestamp: Date.now()
  });
  
  this.status = status;
  if (status === 'failed') {
    this.errorMessage = message;
  }
  
  return this;
};

// 静态方法：按状态查找记录
redemptionRecordSchema.statics.findByStatus = function(status) {
  return this.find({ status });
};

// 静态方法：查找待处理记录
redemptionRecordSchema.statics.findPending = function() {
  return this.find({ status: 'pending' })
    .sort({ createdAt: 1 });
};

// 静态方法：获取统计数据
redemptionRecordSchema.statics.getStats = async function() {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
};

// 静态方法：按时间段查找记录
redemptionRecordSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ createdAt: -1 });
};

// 静态方法：查找用户最近的提货记录
redemptionRecordSchema.statics.findRecentBySteamId = function(steamId, limit = 5) {
  return this.find({ steamId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

const RedemptionRecord = mongoose.model('RedemptionRecord', redemptionRecordSchema);

module.exports = RedemptionRecord;
