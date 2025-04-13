/**
 * Steam礼物系统 - 提货码生成工具
 * 
 * 此模块用于生成唯一的提货码，支持自定义长度和格式，
 * 并包含验证功能，确保生成的提货码在数据库中是唯一的。
 */

const crypto = require('crypto');
const RedemptionCode = require('../models/redemptionCode');

// 提货码字符集 - 排除了容易混淆的字符如 0, O, 1, I, l
const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 生成随机提货码
 * @param {number} length - 提货码长度，默认为 12
 * @param {boolean} includeHyphens - 是否在提货码中包含连字符
 * @returns {string} 生成的提货码
 */
function generateRandomCode(length = 12, includeHyphens = true) {
  let code = '';
  const chunkSize = 4; // 每组字符数
  
  // 生成随机字符
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, CODE_CHARSET.length);
    code += CODE_CHARSET[randomIndex];
    
    // 每4个字符后添加连字符 (如: ABCD-EFGH-IJKL)
    if (includeHyphens && (i + 1) % chunkSize === 0 && i < length - 1) {
      code += '-';
    }
  }
  
  return code;
}

/**
 * 验证提货码是否唯一
 * @param {string} code - 待验证的提货码
 * @returns {Promise<boolean>} 如果提货码唯一则返回true
 */
async function isCodeUnique(code) {
  const existingCode = await RedemptionCode.findOne({ code });
  return !existingCode;
}

/**
 * 生成唯一的提货码
 * @param {number} length - 提货码长度
 * @param {boolean} includeHyphens - 是否在提货码中包含连字符
 * @returns {Promise<string>} 唯一的提货码
 */
async function generateUniqueCode(length = 12, includeHyphens = true) {
  let isUnique = false;
  let code;
  
  // 重试生成直到找到唯一的代码
  while (!isUnique) {
    code = generateRandomCode(length, includeHyphens);
    isUnique = await isCodeUnique(code);
  }
  
  return code;
}

/**
 * 批量生成唯一提货码
 * @param {number} count - 需要生成的提货码数量
 * @param {Object} options - 配置选项
 * @param {number} options.length - 提货码长度，默认为 12
 * @param {boolean} options.includeHyphens - 是否在提货码中包含连字符，默认为 true
 * @param {string} options.prefix - 提货码前缀，默认为空
 * @returns {Promise<string[]>} 唯一提货码数组
 */
async function generateBulkCodes(count, options = {}) {
  const {
    length = 12,
    includeHyphens = true,
    prefix = ''
  } = options;
  
  const codes = [];
  
  for (let i = 0; i < count; i++) {
    let code = await generateUniqueCode(length, includeHyphens);
    
    // 添加前缀（如有）
    if (prefix) {
      code = `${prefix}${includeHyphens ? '-' : ''}${code}`;
    }
    
    codes.push(code);
  }
  
  return codes;
}

/**
 * 验证提货码格式是否有效
 * @param {string} code - 待验证的提货码
 * @param {Object} options - 验证选项
 * @returns {boolean} 如果格式有效则返回true
 */
function validateCodeFormat(code, options = {}) {
  // 移除连字符进行验证
  const cleanCode = code.replace(/-/g, '');
  
  // 检查长度
  if (options.length && cleanCode.length !== options.length) {
    return false;
  }
  
  // 验证字符集
  const validChars = new RegExp(`^[${CODE_CHARSET}]+$`);
  return validChars.test(cleanCode);
}

/**
 * 格式化提货码，添加或移除连字符
 * @param {string} code - 提货码
 * @param {boolean} includeHyphens - 是否包含连字符
 * @returns {string} 格式化后的提货码
 */
function formatCode(code, includeHyphens = true) {
  // 移除所有连字符
  const cleanCode = code.replace(/-/g, '');
  
  if (!includeHyphens) {
    return cleanCode;
  }
  
  // 添加连字符 (每4个字符)
  const chunkSize = 4;
  let formattedCode = '';
  
  for (let i = 0; i < cleanCode.length; i += chunkSize) {
    const chunk = cleanCode.substring(i, i + chunkSize);
    formattedCode += chunk;
    
    if (i + chunkSize < cleanCode.length) {
      formattedCode += '-';
    }
  }
  
  return formattedCode;
}

module.exports = {
  generateRandomCode,
  generateUniqueCode,
  generateBulkCodes,
  isCodeUnique,
  validateCodeFormat,
  formatCode
};
