const os = require('os');
const SteamBot = require('../steam/steamBot');
const packageJson = require('../package.json');

class SystemService {
  constructor() {
    this.startTime = new Date();
    this.version = packageJson.version;
  }

  /**
   * 获取系统运行时间（毫秒）
   */
  getUptime() {
    return Date.now() - this.startTime.getTime();
  }

  /**
   * 获取格式化的系统运行时间
   */
  getFormattedUptime() {
    const uptime = this.getUptime();
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${days}天 ${hours}小时 ${minutes}分钟`;
  }

  /**
   * 获取系统版本
   */
  getVersion() {
    return this.version;
  }

  /**
   * 获取Steam机器人状态
   */
  getSteamBotStatus() {
    return {
      isConnected: SteamBot.isConnected(),
      username: SteamBot.getUsername(),
      lastLogin: SteamBot.getLastLoginTime(),
      friendsCount: SteamBot.getFriendsCount(),
      pendingGifts: SteamBot.getPendingGiftsCount()
    };
  }

  /**
   * 获取完整系统状态
   */
  getSystemStatus() {
    return {
      uptime: this.getFormattedUptime(),
      version: this.getVersion(),
      steamBot: this.getSteamBotStatus(),
      server: {
        platform: os.platform(),
        arch: os.arch(),
        cpuUsage: process.cpuUsage(),
        memoryUsage: {
          total: os.totalmem(),
          free: os.freemem(),
          processUsage: process.memoryUsage()
        }
      }
    };
  }
}

// 创建单例
const systemService = new SystemService();
module.exports = systemService;
