document.addEventListener('DOMContentLoaded', function() {
    // 提货码管理页面功能
    const codesList = document.getElementById('codes-list');
    const generateCodesForm = document.getElementById('generate-codes-form');
    const gameIdInput = document.getElementById('game-id');
    const gameInfo = document.getElementById('game-info');
    
    // 从URL获取游戏ID
    const pathParts = window.location.pathname.split('/');
    const gameId = pathParts[pathParts.indexOf('games') + 1];
    
    if (gameIdInput) {
      gameIdInput.value = gameId;
    }
    
    // 加载游戏信息
    function loadGameInfo() {
      apiRequest(`/admin/api/games/${gameId}`)
        .then(data => {
          if (data.success) {
            const game = data.game;
            
            // 更新页面游戏信息
            if (gameInfo) {
              gameInfo.innerHTML = `
                <div class="game-image">
                  <img src="${game.imageUrl || '/images/game-placeholder.jpg'}" alt="${game.name}">
                </div>
                <div class="game-details">
                  <h2>${game.customName || game.name}</h2>
                  <p>App ID: ${game.appId || 'N/A'}</p>
                  <p><a href="${game.steamLink}" target="_blank">Steam商店页面</a></p>
                </div>
              `;
            }
            
            // 更新面包屑
            const gameBreadcrumb = document.getElementById('game-breadcrumb');
            if (gameBreadcrumb) {
              gameBreadcrumb.textContent = game.customName || game.name;
            }
          } else {
            showNotification(data.message || '加载游戏信息失败', 'error');
          }
        })
        .catch(error => {
          console.error('Error loading game info:', error);
          showNotification('加载游戏信息时出错', 'error');
        });
    }
    
    // 加载提货码列表
    function loadCodes() {
      apiRequest(`/admin/api/games/${gameId}/codes`)
        .then(data => {
          if (data.success) {
            renderCodes(data.codes);
          } else {
            showNotification(data.message || '加载提货码列表失败', 'error');
          }
        })
        .catch(error => {
          console.error('Error loading codes:', error);
          showNotification('加载提货码列表时出错', 'error');
        });
    }
    
    // 渲染提货码列表
    function renderCodes(codes) {
      if (!codesList) return;
      
      codesList.innerHTML = '';
      
      if (codes.length === 0) {
        codesList.innerHTML = '<tr><td colspan="4" class="empty-state">暂无提货码，请使用上方表单生成</td></tr>';
        return;
      }
      
      codes.forEach(code => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${code.code}</td>
          <td>${code.isUsed ? 
            `<span class="status-badge status-success">已使用</span>` : 
            `<span class="status-badge status-pending">未使用</span>`
          }</td>
          <td>${formatDate(code.createdAt)}</td>
          <td>${code.isUsed ? formatDate(code.usedAt) : '-'}</td>
        `;
        
        codesList.appendChild(tr);
      });
    }
    
    // 格式化日期
    function formatDate(dateString) {
      if (!dateString) return '-';
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    
    // 生成提货码表单提交
    if (generateCodesForm) {
      generateCodesForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const count = document.getElementById('codes-count').value;
        const submitButton = this.querySelector('button[type="submit"]');
        
        if (!count || isNaN(count) || count < 1) {
          showNotification('请输入有效的提货码数量', 'error');
          return;
        }
        
        submitButton.disabled = true;
        submitButton.innerHTML = '生成中...';
        
        apiRequest(`/admin/api/games/${gameId}/codes`, 'POST', { count: parseInt(count) })
          .then(data => {
            submitButton.disabled = false;
            submitButton.innerHTML = '生成提货码';
            
            if (data.success) {
              showNotification(`成功生成 ${count} 个提货码`);
              // 重新加载提货码列表
              loadCodes();
              // 重置表单
              document.getElementById('codes-count').value = '';
            } else {
              showNotification(data.message || '生成提货码失败', 'error');
            }
          })
          .catch(error => {
            console.error('Error generating codes:', error);
            submitButton.disabled = false;
            submitButton.innerHTML = '生成提货码';
            showNotification('生成提货码时出错', 'error');
          });
      });
    }
    
    // 导出提货码按钮
    const exportCodesBtn = document.getElementById('export-codes-btn');
    if (exportCodesBtn) {
      exportCodesBtn.addEventListener('click', function() {
        apiRequest(`/admin/api/games/${gameId}/codes/export`)
          .then(data => {
            if (data.success && data.codes && data.codes.length > 0) {
              // 准备CSV内容
              const headers = ['提货码', '状态', '创建时间', '使用时间'];
              const csvContent = [
                headers.join(','),
                ...data.codes.map(code => [
                  code.code,
                  code.isUsed ? '已使用' : '未使用',
                  formatDate(code.createdAt),
                  code.isUsed ? formatDate(code.usedAt) : '-'
                ].join(','))
              ].join('\n');
              
              // 创建下载链接
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.setAttribute('href', url);
              link.setAttribute('download', `提货码-${data.game.name}-${new Date().toISOString().slice(0, 10)}.csv`);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            } else {
              showNotification(data.message || '没有可导出的提货码', 'error');
            }
          })
          .catch(error => {
            console.error('Error exporting codes:', error);
            showNotification('导出提货码时出错', 'error');
          });
      });
    }
    
    // 初始化页面
    if (gameId) {
      loadGameInfo();
      loadCodes();
    }
  });
  