const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const crypto = require('crypto');

/**
 * 提货码模型
 * 用于存储游戏礼物的提货码信息
 */
const redemptionCodeSchema = new Schema({
  // 提货码，唯一标识
  code: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // 关联的游戏ID
  gameId: {
    type: Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  
  // 提货码使用状态
  isUsed: {
    type: Boolean,
    default: false
  },
  
  // 创建时间
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // 使用时间
  usedAt: {
    type: Date,
    default: null
  },
  
  // 创建者(管理员)ID
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  },
  
  // 批次号 - 用于批量管理
  batchId: {
    type: String,
    default: null
  }
});

/**
 * 生成随机提货码
 * @param {Number} length - 提货码长度
 * @returns {String} - 生成的提货码
 */
redemptionCodeSchema.statics.generateCode = function(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  // 使用加密安全的随机数生成器
  const randomBytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    const randomIndex = randomBytes[i] % chars.length;
    code += chars.charAt(randomIndex);
  }
  
  return code;
};

/**
 * 批量生成提货码
 * @param {ObjectId} gameId - 游戏ID
 * @param {Number} count - 生成数量
 * @param {ObjectId} adminId - 管理员ID
 * @returns {Promise<Array>} - 生成的提货码数组
 */
redemptionCodeSchema.statics.generateBatch = async function(gameId, count, adminId) {
  if (!gameId || count <= 0) {
    throw new Error('游戏ID和数量为必填项');
  }
  
  const batchId = new mongoose.Types.ObjectId().toString();
  const codes = [];
  const createdCodes = [];
  
  // 生成指定数量的唯一提货码
  for (let i = 0; i < count; i++) {
    let code;
    let isUnique = false;
    
    // 循环生成直到得到唯一的提货码
    while (!isUnique) {
      code = this.generateCode();
      // 确保在当前批次和数据库中都是唯一的
      if (!codes.includes(code) && !(await this.findOne({ code }))) {
        isUnique = true;
        codes.push(code);
      }
    }
    
    createdCodes.push({
      code,
      gameId,
      createdBy: adminId,
      batchId,
      isUsed: false
    });
  }
  
  // 批量插入提货码
  return this.insertMany(createdCodes);
};

/**
 * 验证提货码
 * @param {String} code - 提货码
 * @returns {Promise<Object|null>} - 提货码对象或null
 */
redemptionCodeSchema.statics.validateCode = async function(code) {
  return this.findOne({ code, isUsed: false }).populate('gameId');
};

/**
 * 标记提货码为已使用
 * @param {String} code - 提货码
 * @returns {Promise<Object|null>} - 更新后的提货码对象或null
 */
redemptionCodeSchema.statics.markAsUsed = async function(code) {
  return this.findOneAndUpdate(
    { code, isUsed: false },
    { 
      isUsed: true, 
      usedAt: new Date() 
    },
    { new: true }
  );
};

/**
 * 统计游戏的提货码情况
 * @param {ObjectId} gameId - 游戏ID
 * @returns {Promise<Object>} - 统计信息
 */
redemptionCodeSchema.statics.getStatsByGameId = async function(gameId) {
  const totalCount = await this.countDocuments({ gameId });
  const usedCount = await this.countDocuments({ gameId, isUsed: true });
  
  return {
    total: totalCount,
    used: usedCount,
    available: totalCount - usedCount,
    usageRate: totalCount > 0 ? (usedCount / totalCount) * 100 : 0
  };
};

// 创建索引
redemptionCodeSchema.index({ gameId: 1, isUsed: 1 });
redemptionCodeSchema.index({ batchId: 1 });

const RedemptionCode = mongoose.model('RedemptionCode', redemptionCodeSchema);

module.exports = RedemptionCode;
