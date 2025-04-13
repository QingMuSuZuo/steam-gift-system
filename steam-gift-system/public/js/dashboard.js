document.addEventListener('DOMContentLoaded', function() {
    // 获取系统状态数据
    fetchSystemStatus();
    
    // 获取最近活动数据
    fetchRecentActivity();
    
    // 自动刷新系统状态（每30秒）
    setInterval(fetchSystemStatus, 30000);
    
    function fetchSystemStatus() {
      apiRequest('/admin/api/system-status')
        .then(data => {
          if (data.success) {
            updateSystemStatus(data.status);
          } else {
            console.error('Failed to fetch system status:', data.message);
          }
        })
        .catch(error => {
          console.error('Error fetching system status:', error);
        });
    }
    
    function updateSystemStatus(status) {
      // 更新系统状态指示器
      updateStatusIndicator('system-status', status.system.online);
      updateStatusIndicator('bot-status', status.bot.online);
      updateStatusIndicator('inventory-status', status.inventory.sufficient);
      
      // 更新统计数字
      document.getElementById('total-games').textContent = status.games.total;
      document.getElementById('available-codes').textContent = status.codes.available;
      document.getElementById('used-codes').textContent = status.codes.used;
      document.getElementById('total-deliveries').textContent = status.deliveries.total;
      
      // 更新库存状态描述
      const inventoryDesc = document.getElementById('inventory-description');
      if (inventoryDesc) {
        if (status.inventory.sufficient) {
          inventoryDesc.textContent = '库存充足，系统运行正常';
        } else {
          inventoryDesc.textContent = '库存不足，请及时充值';
          inventoryDesc.style.color = 'var(--error-color)';
        }
      }
      
      // 更新最后刷新时间
      document.getElementById('last-updated').textContent = 
        `最后更新: ${new Date().toLocaleTimeString()}`;
    }
    
    function updateStatusIndicator(elementId, isOnline) {
      const indicator = document.getElementById(elementId);
      if (indicator) {
        // 清除现有类
        indicator.classList.remove('green', 'red', 'yellow');
        
        // 添加状态类
        if (isOnline) {
          indicator.classList.add('green');
          indicator.nextElementSibling.textContent = '正常';
        } else {
          indicator.classList.add('red');
          indicator.nextElementSibling.textContent = '异常';
        }
      }
    }
    
    function fetchRecentActivity() {
      apiRequest('/admin/api/recent-activity')
        .then(data => {
          if (data.success && data.activities.length > 0) {
            const activityList = document.getElementById('activity-list');
            activityList.innerHTML = ''; // 清空现有列表
            
            data.activities.forEach(activity => {
              const activityItem = document.createElement('li');
              activityItem.className = 'activity-item';
              
              // 根据活动类型确定图标
              let iconName = 'pending.svg';
              switch (activity.type) {
                case 'code_generated':
                  iconName = 'codes.svg';
                  break;
                case 'game_added':
                  iconName = 'games.svg';
                  break;
                case 'delivery_completed':
                  iconName = 'success.svg';
                  break;
                case 'delivery_failed':
                  iconName = 'error.svg';
                  break;
              }
              
              const timeAgo = getTimeAgo(new Date(activity.timestamp));
              
              activityItem.innerHTML = `
                <div class="activity-icon">
                  <img src="/images/icons/${iconName}" alt="${activity.type}">
                </div>
                <div class="activity-details">
                  <h3>${activity.title}</h3>
                  <p>${activity.description}</p>
                </div>
                <span class="activity-time">${timeAgo}</span>
              `;
              
              activityList.appendChild(activityItem);
            });
          }
        })
        .catch(error => {
          console.error('Error fetching recent activity:', error);
        });
    }
    
    function getTimeAgo(date) {
      const seconds = Math.floor((new Date() - date) / 1000);
      
      let interval = Math.floor(seconds / 31536000);
      if (interval > 1) return interval + ' 年前';
      
      interval = Math.floor(seconds / 2592000);
      if (interval > 1) return interval + ' 个月前';
      
      interval = Math.floor(seconds / 86400);
      if (interval > 1) return interval + ' 天前';
      
      interval = Math.floor(seconds / 3600);
      if (interval > 1) return interval + ' 小时前';
      
      interval = Math.floor(seconds / 60);
      if (interval > 1) return interval + ' 分钟前';
      
      return Math.floor(seconds) + ' 秒前';
    }
  });
  