/**
 * Steam礼物系统 - 请求验证中间件
 * 负责验证所有API请求的格式和内容
 */

const { body, param, query, validationResult } = require('express-validator');
const steamUtils = require('../utils/steamUtils');

// 通用错误处理函数
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
      message: '请求参数无效'
    });
  }
  next();
};

// 验证规则集合
const validators = {
  // 管理员登录验证
  loginValidator: [
    body('username')
      .trim()
      .notEmpty().withMessage('用户名不能为空')
      .isLength({ min: 3, max: 20 }).withMessage('用户名长度必须在3-20个字符之间'),
    body('password')
      .notEmpty().withMessage('密码不能为空')
      .isLength({ min: 6 }).withMessage('密码长度必须至少为6个字符'),
    validateRequest
  ],

  // 管理员密码修改验证
  passwordUpdateValidator: [
    body('currentPassword')
      .notEmpty().withMessage('当前密码不能为空'),
    body('newPassword')
      .notEmpty().withMessage('新密码不能为空')
      .isLength({ min: 6 }).withMessage('新密码长度必须至少为6个字符')
      .not().equals(body('currentPassword')).withMessage('新密码不能与当前密码相同'),
    body('confirmPassword')
      .notEmpty().withMessage('确认密码不能为空')
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('确认密码与新密码不匹配');
        }
        return true;
      }),
    validateRequest
  ],

  // 管理员资料更新验证
  profileUpdateValidator: [
    body('username')
      .optional()
      .trim()
      .isLength({ min: 3, max: 20 }).withMessage('用户名长度必须在3-20个字符之间'),
    body('email')
      .optional()
      .trim()
      .isEmail().withMessage('请提供有效的电子邮件地址'),
    validateRequest
  ],

  // 游戏添加验证
  gameCreateValidator: [
    body('steamLink')
      .trim()
      .notEmpty().withMessage('Steam游戏链接不能为空')
      .custom(value => {
        if (!value.includes('store.steampowered.com/app/')) {
          throw new Error('请提供有效的Steam游戏商店链接');
        }
        return true;
      }),
    body('customName')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('自定义名称不能超过100个字符'),
    body('price')
      .optional()
      .isNumeric().withMessage('价格必须是数字'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('描述不能超过500个字符'),
    validateRequest
  ],

  // 游戏更新验证
  gameUpdateValidator: [
    param('id')
      .notEmpty().withMessage('游戏ID不能为空')
      .isMongoId().withMessage('游戏ID格式无效'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 }).withMessage('游戏名称长度必须在1-100个字符之间'),
    body('customName')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('自定义名称不能超过100个字符'),
    body('imageUrl')
      .optional()
      .trim()
      .isURL().withMessage('请提供有效的图片URL'),
    body('price')
      .optional()
      .isNumeric().withMessage('价格必须是数字'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('描述不能超过500个字符'),
    validateRequest
  ],

  // 提货码生成验证
  codeGenerateValidator: [
    param('id')
      .notEmpty().withMessage('游戏ID不能为空')
      .isMongoId().withMessage('游戏ID格式无效'),
    body('quantity')
      .notEmpty().withMessage('数量不能为空')
      .isInt({ min: 1, max: 1000 }).withMessage('数量必须是1-1000之间的整数'),
    validateRequest
  ],

  // 提货请求验证
  redemptionValidator: [
    body('code')
      .trim()
      .notEmpty().withMessage('提货码不能为空')
      .isLength({ min: 6, max: 20 }).withMessage('提货码长度无效'),
    body('steamIdentifier')
      .trim()
      .notEmpty().withMessage('Steam信息不能为空')
      .custom(value => {
        // 验证是否是有效的Steam ID、好友代码或个人资料链接
        if (!steamUtils.isValidSteamIdentifier(value)) {
          throw new Error('请提供有效的Steam好友链接、好友代码或个人资料链接');
        }
        return true;
      }),
    validateRequest
  ],

  // 提货确认验证
  redemptionConfirmValidator: [
    param('id')
      .notEmpty().withMessage('提货记录ID不能为空')
      .isMongoId().withMessage('提货记录ID格式无效'),
    validateRequest
  ],
  
  // 提货状态查询验证
  redemptionStatusValidator: [
    param('id')
      .notEmpty().withMessage('提货记录ID不能为空')
      .isMongoId().withMessage('提货记录ID格式无效'),
    validateRequest
  ],
  
  // 游戏删除验证
  gameDeleteValidator: [
    param('id')
      .notEmpty().withMessage('游戏ID不能为空')
      .isMongoId().withMessage('游戏ID格式无效'),
    validateRequest
  ],
  
  // 提货码列表查询验证
  codesListValidator: [
    param('id')
      .notEmpty().withMessage('游戏ID不能为空')
      .isMongoId().withMessage('游戏ID格式无效'),
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('页码必须是大于0的整数'),
    query('limit')
      .optional()
      .isInt({ min: 5, max: 100 }).withMessage('每页数量必须是5-100之间的整数'),
    query('status')
      .optional()
      .isIn(['used', 'unused', 'all']).withMessage('状态值无效'),
    validateRequest
  ],
  
  // 发货记录查询验证
  recordsListValidator: [
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('页码必须是大于0的整数'),
    query('limit')
      .optional()
      .isInt({ min: 5, max: 100 }).withMessage('每页数量必须是5-100之间的整数'),
    query('status')
      .optional()
      .isIn(['pending', 'friend_added', 'gift_sent', 'completed', 'failed', 'all']).withMessage('状态值无效'),
    query('startDate')
      .optional()
      .isDate().withMessage('开始日期格式无效'),
    query('endDate')
      .optional()
      .isDate().withMessage('结束日期格式无效')
      .custom((value, { req }) => {
        if (req.query.startDate && new Date(value) < new Date(req.query.startDate)) {
          throw new Error('结束日期不能早于开始日期');
        }
        return true;
      }),
    validateRequest
  ]
};

module.exports = validators;
