document.addEventListener('DOMContentLoaded', function() {
    // 侧边栏活动链接高亮
    const currentPath = window.location.pathname;
    const sidebarLinks = document.querySelectorAll('.sidebar-menu a');
    
    sidebarLinks.forEach(link => {
      if (currentPath.includes(link.getAttribute('href'))) {
        link.classList.add('active');
      }
    });
    
    // 登出按钮事件处理
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        
        if (confirm('确定要退出登录吗？')) {
          // 清除本地存储的令牌
          localStorage.removeItem('adminToken');
          
          // 重定向到登录页面
          window.location.href = '/admin/login';
        }
      });
    }
    
    // API请求封装函数
    window.apiRequest = function(url, method = 'GET', data = null) {
      const token = localStorage.getItem('adminToken');
      
      const options = {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      };
      
      if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
      }
      
      return fetch(url, options)
        .then(response => {
          if (response.status === 401) {
            // 未授权，可能是令牌过期
            localStorage.removeItem('adminToken');
            window.location.href = '/admin/login?expired=true';
            throw new Error('认证已过期，请重新登录');
          }
          return response.json();
        });
    };
    
    // 通知函数
    window.showNotification = function(message, type = 'success') {
      const notification = document.createElement('div');
      notification.className = `notification ${type}`;
      notification.textContent = message;
      
      document.body.appendChild(notification);
      
      // 显示通知
      setTimeout(() => {
        notification.classList.add('show');
      }, 100);
      
      // 3秒后移除通知
      setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 3000);
    };
    
    // 登录表单处理
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        fetch('/admin/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: username,
            password: password
          })
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            // 存储令牌
            localStorage.setItem('adminToken', data.token);
            
            // 重定向到仪表盘
            window.location.href = '/admin/dashboard';
          } else {
            const errorMsg = document.getElementById('error-message');
            errorMsg.textContent = data.message || '登录失败，请检查用户名和密码';
            errorMsg.style.display = 'block';
          }
        })
        .catch(error => {
          console.error('Error:', error);
          const errorMsg = document.getElementById('error-message');
          errorMsg.textContent = '登录过程中出现错误，请稍后重试';
          errorMsg.style.display = 'block';
        });
      });
    }
  });
  