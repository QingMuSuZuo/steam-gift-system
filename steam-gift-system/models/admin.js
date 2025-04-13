const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config/auth');

// 管理员模式定义
const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, '请提供有效的电子邮件地址']
  },
  role: {
    type: String,
    enum: ['admin', 'superadmin'],
    default: 'admin'
  },
  lastLogin: {
    type: Date,
    default: null
  }
}, {
  timestamps: true // 自动添加 createdAt 和 updatedAt 字段
});

// 密码加密中间件 - 保存前自动哈希密码
adminSchema.pre('save', async function(next) {
  const admin = this;
  
  // 仅当密码被修改时才重新加密
  if (!admin.isModified('password')) return next();
  
  try {
    // 生成盐并哈希密码
    const salt = await bcrypt.genSalt(10);
    admin.password = await bcrypt.hash(admin.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 密码验证方法
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// 生成JWT令牌方法
adminSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { id: this._id, username: this.username, role: this.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiration }
  );
};

// 更新最后登录时间
adminSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  return this.save();
};

// 简单的方法用于创建初始超级管理员（仅用于系统初始化）
adminSchema.statics.createInitialAdmin = async function(adminData) {
  try {
    const existingAdmin = await this.findOne({ role: 'superadmin' });
    if (existingAdmin) {
      return { success: false, message: '超级管理员已存在' };
    }
    
    const admin = new this({
      username: adminData.username,
      password: adminData.password,
      email: adminData.email,
      role: 'superadmin'
    });
    
    await admin.save();
    return { success: true, admin };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// 查找管理员但不返回密码
adminSchema.statics.findByIdSafe = async function(id) {
  return this.findById(id).select('-password');
};

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;
