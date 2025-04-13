document.addEventListener('DOMContentLoaded', function() {
    // 个人信息表单
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        
        if (!username.trim()) {
          showError('用户名不能为空');
          return;
        }
        
        if (!email.trim()) {
          showError('邮箱不能为空');
          return;
        }
        
        // 发送更新请求
        window.apiRequest('/admin/api/settings/profile', 'PUT', {
          username: username,
          email: email
        })
        .then(data => {
          if (data.success) {
            window.showNotification('个人信息已更新', 'success');
            
            // 更新页面上的用户名显示
            const userNameDisplay = document.getElementById('user-name-display');
            if (userNameDisplay) {
              userNameDisplay.textContent = username;
            }
          } else {
            showError(data.message || '更新个人信息失败');
          }
        })
        .catch(error => {
          console.error('Error updating profile:', error);
          showError('更新个人信息时出错，请稍后重试');
        });
      });
    }
    
    // 密码修改表单
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
      passwordForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        
        if (!currentPassword) {
          showError('当前密码不能为空');
          return;
        }
        
        if (!newPassword) {
          showError('新密码不能为空');
          return;
        }
        
        if (newPassword.length < 8) {
          showError('新密码长度必须至少为8个字符');
          return;
        }
        
        if (newPassword !== confirmPassword) {
          showError('两次输入的新密码不匹配');
          return;
        }
        
        // 发送更新请求
        window.apiRequest('/admin/api/settings/password', 'PUT', {
          currentPassword: currentPassword,
          newPassword: newPassword
        })
        .then(data => {
          if (data.success) {
            window.showNotification('密码已更新', 'success');
            
            // 清空表单
            passwordForm.reset();
          } else {
            showError(data.message || '更新密码失败');
          }
        })
        .catch(error => {
          console.error('Error updating password:', error);
          showError('更新密码时出错，请稍后重试');
        });
      });
    }
    
    // 系统设置表单
    const systemSettingsForm = document.getElementById('system-settings-form');
    if (systemSettingsForm) {
      systemSettingsForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const botUsername = document.getElementById('bot-username').value;
        const botPassword = document.getElementById('bot-password').value;
        const botSharedSecret = document.getElementById('bot-shared-secret').value;
        const botIdentitySecret = document.getElementById('bot-identity-secret').value;
        
        // 发送更新请求
        window.apiRequest('/admin/api/settings/bot', 'PUT', {
          username: botUsername,
          password: botPassword,
          sharedSecret: botSharedSecret,
          identitySecret: botIdentitySecret
        })
        .then(data => {
          if (data.success) {
            window.showNotification('机器人设置已更新', 'success');
          } else {
            showError(data.message || '更新机器人设置失败');
          }
        })
        .catch(error => {
          console.error('Error updating bot settings:', error);
          showError('更新机器人设置时出错，请稍后重试');
        });
      });
    }
    
    // 重新启动机器人按钮
    const restartBotBtn = document.getElementById('restart-bot-btn');
    if (restartBotBtn) {
      restartBotBtn.addEventListener('click', function() {
        if (confirm('确定要重新启动Steam机器人吗？这可能会中断正在进行的操作。')) {
          this.disabled = true;
          this.innerHTML = '<span class="spinner"></span> 正在重启...';
          
          window.apiRequest('/admin/api/bot/restart', 'POST')
            .then(data => {
              if (data.success) {
                window.showNotification('机器人已重新启动', 'success');
              } else {
                showError(data.message || '重启机器人失败');
              }
              
              this.disabled = false;
              this.textContent = '重启机器人';
            })
            .catch(error => {
              console.error('Error restarting bot:', error);
              showError('重启机器人时出错，请稍后重试');
              
              this.disabled = false;
              this.textContent = '重启机器人';
            });
        }
      });
    }
    
    // 测试机器人连接按钮
    const testBotBtn = document.getElementById('test-bot-btn');
    if (testBotBtn) {
      testBotBtn.addEventListener('click', function() {
        this.disabled = true;
        this.innerHTML = '<span class="spinner"></span> 正在测试...';
        
        window.apiRequest('/admin/api/bot/test', 'POST')
          .then(data => {
            if (data.success) {
              window.showNotification('机器人连接测试成功', 'success');
            } else {
              showError(data.message || '机器人连接测试失败');
            }
            
            this.disabled = false;
            this.textContent = '测试连接';
          })
          .catch(error => {
            console.error('Error testing bot connection:', error);
            showError('测试机器人连接时出错，请稍后重试');
            
            this.disabled = false;
            this.textContent = '测试连接';
          });
      });
    }
    
    // 显示错误消息
    function showError(message) {
      window.showNotification(message, 'error');
    }
  });
  