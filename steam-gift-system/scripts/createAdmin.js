const mongoose = require('mongoose');
const Admin = require('../models/Admin');
require('dotenv').config();

// 连接MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  console.log('MongoDB连接成功');
  
  try {
    // 检查是否已存在管理员
    const adminCount = await Admin.countDocuments();
    
    if (adminCount > 0) {
      console.log('管理员账户已存在');
    } else {
      // 创建默认管理员
      const admin = new Admin({
        username: 'admin',
        password: 'admin123' // 这将在保存时自动哈希
      });
      
      await admin.save();
      console.log('默认管理员账户已创建');
      console.log('用户名: admin');
      console.log('密码: admin123');
      console.log('请登录后立即修改默认密码');
    }
    
    // 断开连接
    mongoose.disconnect();
  } catch (error) {
    console.error('创建管理员错误:', error);
    mongoose.disconnect();
  }
})
.catch(err => {
  console.error('MongoDB连接失败:', err);
});
