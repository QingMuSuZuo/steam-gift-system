document.addEventListener('DOMContentLoaded', function() {
    // 游戏管理页面功能
    const gamesList = document.getElementById('games-list');
    const addGameModal = document.getElementById('add-game-modal');
    const addGameBtn = document.getElementById('add-game-btn');
    const addGameForm = document.getElementById('add-game-form');
    const closeModalBtn = document.getElementById('close-modal');
    const searchGameInput = document.getElementById('search-game');
    const gameSearchForm = document.getElementById('game-search-form');
    
    // 获取游戏列表数据
    function loadGames() {
      apiRequest('/admin/api/games')
        .then(data => {
          if (data.success) {
            renderGames(data.games);
          } else {
            showNotification(data.message || '加载游戏列表失败', 'error');
          }
        })
        .catch(error => {
          console.error('Error loading games:', error);
          showNotification('加载游戏列表时出错', 'error');
        });
    }
    
    // 渲染游戏列表
    function renderGames(games) {
      if (!gamesList) return;
      
      gamesList.innerHTML = '';
      
      if (games.length === 0) {
        gamesList.innerHTML = '<div class="empty-state">暂无游戏，点击"添加游戏"按钮添加</div>';
        return;
      }
      
      games.forEach(game => {
        const gameItem = document.createElement('div');
        gameItem.className = 'game-item';
        gameItem.innerHTML = `
          <div class="game-image">
            <img src="${game.imageUrl || '/images/game-placeholder.jpg'}" alt="${game.name}">
          </div>
          <div class="game-info">
            <h3 class="game-name">${game.customName || game.name}</h3>
            <p class="game-id">App ID: ${game.appId || 'N/A'}</p>
            <p class="game-link"><a href="${game.steamLink}" target="_blank">Steam页面</a></p>
            <div class="code-count">
              <span>提货码: </span>
              <span class="count">${game.codeCount || 0}</span>
            </div>
          </div>
          <div class="game-actions">
            <button class="view-codes-btn" data-id="${game._id}">提货码管理</button>
            <button class="edit-game-btn" data-id="${game._id}">
              <img src="/images/icons/edit.svg" alt="编辑">
            </button>
            <button class="delete-game-btn" data-id="${game._id}">
              <img src="/images/icons/delete.svg" alt="删除">
            </button>
          </div>
        `;
        
        gamesList.appendChild(gameItem);
        
        // 绑定提货码管理按钮事件
        gameItem.querySelector('.view-codes-btn').addEventListener('click', function() {
          const gameId = this.getAttribute('data-id');
          window.location.href = `/admin/games/${gameId}/codes`;
        });
        
        // 绑定编辑游戏按钮事件
        gameItem.querySelector('.edit-game-btn').addEventListener('click', function() {
          const gameId = this.getAttribute('data-id');
          openEditGameModal(gameId);
        });
        
        // 绑定删除游戏按钮事件
        gameItem.querySelector('.delete-game-btn').addEventListener('click', function() {
          const gameId = this.getAttribute('data-id');
          confirmDeleteGame(gameId, game.name);
        });
      });
    }
    
    // 打开添加游戏模态框
    if (addGameBtn) {
      addGameBtn.addEventListener('click', function() {
        addGameModal.style.display = 'flex';
        // 重置表单
        addGameForm.reset();
        document.getElementById('preview-image').src = '/images/game-placeholder.jpg';
        document.getElementById('game-info-loading').style.display = 'none';
        document.getElementById('game-info-container').style.display = 'none';
      });
    }
    
    // 关闭模态框
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', function() {
        addGameModal.style.display = 'none';
      });
      
      // 点击模态框外部关闭
      window.addEventListener('click', function(event) {
        if (event.target === addGameModal) {
          addGameModal.style.display = 'none';
        }
      });
    }
    
    // 处理Steam链接输入，获取游戏信息
    const steamLinkInput = document.getElementById('steam-link');
    if (steamLinkInput) {
      steamLinkInput.addEventListener('blur', function() {
        const steamLink = this.value.trim();
        if (steamLink && steamLink.includes('store.steampowered.com')) {
          // 显示加载中状态
          document.getElementById('game-info-loading').style.display = 'block';
          document.getElementById('game-info-container').style.display = 'none';
          
          // 请求游戏信息
          apiRequest('/admin/api/games/info', 'POST', { steamLink: steamLink })
            .then(data => {
              document.getElementById('game-info-loading').style.display = 'none';
              
              if (data.success) {
                // 显示游戏信息
                document.getElementById('game-info-container').style.display = 'block';
                document.getElementById('game-name').textContent = data.game.name;
                document.getElementById('game-app-id').textContent = data.game.appId;
                document.getElementById('preview-image').src = data.game.imageUrl;
                
                // 填充自定义表单字段
                document.getElementById('custom-name').value = data.game.name;
                document.getElementById('app-id').value = data.game.appId;
              } else {
                showNotification(data.message || '获取游戏信息失败', 'error');
              }
            })
            .catch(error => {
              document.getElementById('game-info-loading').style.display = 'none';
              console.error('Error fetching game info:', error);
              showNotification('获取游戏信息时出错', 'error');
            });
        }
      });
    }
    
    // 处理自定义图片上传预览
    const customImageInput = document.getElementById('custom-image');
    if (customImageInput) {
      customImageInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
          const reader = new FileReader();
          reader.onload = function(e) {
            document.getElementById('preview-image').src = e.target.result;
          };
          reader.readAsDataURL(this.files[0]);
        }
      });
    }
    
    // 添加游戏表单提交
    if (addGameForm) {
      addGameForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData(this);
        const submitButton = this.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.innerHTML = '添加中...';
        
        fetch('/admin/api/games', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
          },
          body: formData
        })
        .then(response => response.json())
        .then(data => {
          submitButton.disabled = false;
          submitButton.innerHTML = '添加游戏';
          
          if (data.success) {
            addGameModal.style.display = 'none';
            showNotification('游戏添加成功');
            // 重新加载游戏列表
            loadGames();
          } else {
            showNotification(data.message || '添加游戏失败', 'error');
          }
        })
        .catch(error => {
          console.error('Error adding game:', error);
          submitButton.disabled = false;
          submitButton.innerHTML = '添加游戏';
          showNotification('添加游戏时出错', 'error');
        });
      });
    }
    
    // 打开编辑游戏模态框
    function openEditGameModal(gameId) {
      // 获取游戏信息
      apiRequest(`/admin/api/games/${gameId}`)
        .then(data => {
          if (data.success) {
            const game = data.game;
            
            // 修改模态框标题和提交按钮
            document.getElementById('modal-title').textContent = '编辑游戏';
            const submitButton = addGameForm.querySelector('button[type="submit"]');
            submitButton.textContent = '保存修改';
            
            // 填充表单字段
            document.getElementById('steam-link').value = game.steamLink;
            document.getElementById('custom-name').value = game.customName || game.name;
            document.getElementById('app-id').value = game.appId;
            document.getElementById('preview-image').src = game.imageUrl || '/images/game-placeholder.jpg';
            
            // 添加游戏ID隐藏字段
            let gameIdInput = document.getElementById('game-id');
            if (!gameIdInput) {
              gameIdInput = document.createElement('input');
              gameIdInput.type = 'hidden';
              gameIdInput.id = 'game-id';
              gameIdInput.name = 'gameId';
              addGameForm.appendChild(gameIdInput);
            }
            gameIdInput.value = gameId;
            
            // 显示游戏信息
            document.getElementById('game-info-container').style.display = 'block';
            document.getElementById('game-name').textContent = game.name;
            document.getElementById('game-app-id').textContent = game.appId;
            
            // 显示模态框
            addGameModal.style.display = 'flex';
          } else {
            showNotification(data.message || '获取游戏信息失败', 'error');
          }
        })
        .catch(error => {
          console.error('Error fetching game details:', error);
          showNotification('获取游戏信息时出错', 'error');
        });
    }
    
    // 确认删除游戏
    function confirmDeleteGame(gameId, gameName) {
      if (confirm(`确定要删除游戏 "${gameName}" 吗？此操作不可恢复！`)) {
        apiRequest(`/admin/api/games/${gameId}`, 'DELETE')
          .then(data => {
            if (data.success) {
              showNotification('游戏删除成功');
              // 重新加载游戏列表
              loadGames();
            } else {
              showNotification(data.message || '删除游戏失败', 'error');
            }
          })
          .catch(error => {
            console.error('Error deleting game:', error);
            showNotification('删除游戏时出错', 'error');
          });
      }
    }
    
    // 搜索游戏功能
    if (gameSearchForm) {
      gameSearchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const searchTerm = searchGameInput.value.trim();
        if (searchTerm) {
          apiRequest(`/admin/api/games/search?q=${encodeURIComponent(searchTerm)}`)
            .then(data => {
              if (data.success) {
                renderGames(data.games);
              } else {
                showNotification(data.message || '搜索游戏失败', 'error');
              }
            })
            .catch(error => {
              console.error('Error searching games:', error);
              showNotification('搜索游戏时出错', 'error');
            });
        } else {
          // 空搜索，加载所有游戏
          loadGames();
        }
      });
    }
    
    // 初始加载游戏列表
    if (gamesList) {
      loadGames();
    }
  });
  