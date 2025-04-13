const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Game Schema
 * 存储游戏信息，包括Steam链接、自定义设置和相关元数据
 */
const GameSchema = new Schema({
  // 游戏名称（从Steam获取或自定义）
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  // Steam商店链接
  steamLink: {
    type: String,
    required: true,
    trim: true
  },
  
  // 自定义游戏名称（可选）
  customName: {
    type: String,
    trim: true
  },
  
  // 游戏图片URL
  imageUrl: {
    type: String,
    trim: true
  },
  
  // 标记是否使用自定义图片
  isCustomImage: {
    type: Boolean,
    default: false
  },
  
  // 游戏价格
  price: {
    type: Number,
    min: 0,
    default: 0
  },
  
  // 游戏描述
  description: {
    type: String,
    trim: true
  },
  
  // Steam AppID
  appId: {
    type: String,
    trim: true
  },
  
  // 游戏状态（可用、已下架等）
  status: {
    type: String,
    enum: ['active', 'inactive', 'discontinued'],
    default: 'active'
  },
  
  // 可用提货码数量（通过虚拟字段计算）
  availableCodes: {
    type: Number,
    default: 0
  },
  
  // 已使用提货码数量（通过虚拟字段计算）
  usedCodes: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true, // 自动添加 createdAt 和 updatedAt 字段
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟字段：关联的提货码
GameSchema.virtual('redemptionCodes', {
  ref: 'RedemptionCode',
  localField: '_id',
  foreignField: 'gameId'
});

// 从Steam链接中提取appId的方法
GameSchema.methods.extractAppIdFromLink = function() {
  try {
    const url = new URL(this.steamLink);
    const pathParts = url.pathname.split('/');
    const appIndex = pathParts.indexOf('app');
    
    if (appIndex !== -1 && appIndex + 1 < pathParts.length) {
      this.appId = pathParts[appIndex + 1];
      return this.appId;
    }
    
    // 尝试其他模式匹配
    const appIdMatch = this.steamLink.match(/\/app\/(\d+)/);
    if (appIdMatch && appIdMatch[1]) {
      this.appId = appIdMatch[1];
      return this.appId;
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting AppID:', error);
    return null;
  }
};

// 更新可用/已使用提货码统计的方法
GameSchema.methods.updateCodeStats = async function() {
  const RedemptionCode = mongoose.model('RedemptionCode');
  
  const availableCodes = await RedemptionCode.countDocuments({
    gameId: this._id,
    isUsed: false
  });
  
  const usedCodes = await RedemptionCode.countDocuments({
    gameId: this._id,
    isUsed: true
  });
  
  this.availableCodes = availableCodes;
  this.usedCodes = usedCodes;
  
  return this.save();
};

// 搜索游戏的静态方法
GameSchema.statics.search = function(query) {
  return this.find({
    $or: [
      { name: new RegExp(query, 'i') },
      { customName: new RegExp(query, 'i') },
      { description: new RegExp(query, 'i') },
      { appId: new RegExp(query, 'i') }
    ]
  });
};

// 保存前中间件：确保自动提取appId
GameSchema.pre('save', function(next) {
  if (this.steamLink && !this.appId) {
    this.extractAppIdFromLink();
  }
  
  // 如果没有自定义名称，使用主名称
  if (!this.customName) {
    this.customName = this.name;
  }
  
  next();
});

const Game = mongoose.model('Game', GameSchema);

module.exports = Game;
