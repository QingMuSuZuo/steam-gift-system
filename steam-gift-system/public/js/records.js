document.addEventListener('DOMContentLoaded', function() {
    const recordsTable = document.getElementById('records-table');
    const recordsFilter = document.getElementById('records-filter');
    const recordsSearch = document.getElementById('records-search');
    const recordsDateFrom = document.getElementById('date-from');
    const recordsDateTo = document.getElementById('date-to');
    const recordsPerPage = document.getElementById('records-per-page');
    const paginationContainer = document.getElementById('pagination');
    
    let currentPage = 1;
    let totalPages = 1;
    let currentFilter = 'all';
    let currentSearch = '';
    let dateFrom = '';
    let dateTo = '';
    let perPage = 10;
    
    // 初始化加载记录
    loadRecords();
    
    // 绑定事件监听器
    if (recordsFilter) {
      recordsFilter.addEventListener('change', function() {
        currentFilter = this.value;
        currentPage = 1;
        loadRecords();
      });
    }
    
    if (recordsSearch) {
      recordsSearch.addEventListener('input', function() {
        currentSearch = this.value;
        currentPage = 1;
        loadRecords();
      });
    }
    
    if (recordsDateFrom) {
      recordsDateFrom.addEventListener('change', function() {
        dateFrom = this.value;
        currentPage = 1;
        loadRecords();
      });
    }
    
    if (recordsDateTo) {
      recordsDateTo.addEventListener('change', function() {
        dateTo = this.value;
        currentPage = 1;
        loadRecords();
      });
    }
    
    if (recordsPerPage) {
      recordsPerPage.addEventListener('change', function() {
        perPage = parseInt(this.value);
        currentPage = 1;
        loadRecords();
      });
    }
    
    // 加载记录函数
    function loadRecords() {
      // 显示加载指示器
      if (recordsTable) {
        recordsTable.innerHTML = '<tr><td colspan="6" class="text-center">加载中...</td></tr>';
      }
      
      // 构建查询参数
      const params = new URLSearchParams({
        page: currentPage,
        limit: perPage,
        status: currentFilter !== 'all' ? currentFilter : '',
        search: currentSearch,
        dateFrom: dateFrom,
        dateTo: dateTo
      });
      
      // 发送API请求
      window.apiRequest(`/admin/api/records?${params.toString()}`)
        .then(data => {
          if (data.success) {
            displayRecords(data.records);
            updatePagination(data.totalPages, data.currentPage);
            displayStats(data.stats);
          } else {
            showError(data.message || '加载记录失败');
          }
        })
        .catch(error => {
          console.error('Error loading records:', error);
          showError('加载记录出错，请稍后重试');
        });
    }
    
    // 显示记录函数
    function displayRecords(records) {
      if (!recordsTable) return;
      
      if (records.length === 0) {
        recordsTable.innerHTML = '<tr><td colspan="6" class="text-center">没有找到记录</td></tr>';
        return;
      }
      
      let html = '';
      
      records.forEach(record => {
        const statusClass = getStatusClass(record.status);
        const statusText = getStatusText(record.status);
        
        html += `
          <tr>
            <td>${record.code}</td>
            <td>${record.game ? record.game.name : '未知游戏'}</td>
            <td>${record.steamId || '未提供'}</td>
            <td>
              <span class="status-badge ${statusClass}">${statusText}</span>
            </td>
            <td>${formatDate(record.createdAt)}</td>
            <td>
              <button 
                class="btn-view-details" 
                data-record-id="${record._id}" 
                title="查看详情">
                <img src="/images/icons/view.svg" alt="查看" width="16" height="16">
              </button>
            </td>
          </tr>
        `;
      });
      
      recordsTable.innerHTML = html;
      
      // 绑定详情按钮点击事件
      const detailButtons = document.querySelectorAll('.btn-view-details');
      detailButtons.forEach(button => {
        button.addEventListener('click', function() {
          const recordId = this.getAttribute('data-record-id');
          showRecordDetails(recordId);
        });
      });
    }
    
    // 更新分页
    function updatePagination(total, current) {
      if (!paginationContainer) return;
      
      totalPages = total;
      currentPage = current;
      
      if (total <= 1) {
        paginationContainer.innerHTML = '';
        return;
      }
      
      let html = '<ul class="pagination">';
      
      // 上一页按钮
      html += `
        <li class="page-item ${current === 1 ? 'disabled' : ''}">
          <a class="page-link" href="#" data-page="${current - 1}">上一页</a>
        </li>
      `;
      
      // 页码按钮
      const startPage = Math.max(1, current - 2);
      const endPage = Math.min(total, current + 2);
      
      if (startPage > 1) {
        html += `
          <li class="page-item">
            <a class="page-link" href="#" data-page="1">1</a>
          </li>
          ${startPage > 2 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
        `;
      }
      
      for (let i = startPage; i <= endPage; i++) {
        html += `
          <li class="page-item ${i === current ? 'active' : ''}">
            <a class="page-link" href="#" data-page="${i}">${i}</a>
          </li>
        `;
      }
      
      if (endPage < total) {
        html += `
          ${endPage < total - 1 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
          <li class="page-item">
            <a class="page-link" href="#" data-page="${total}">${total}</a>
          </li>
        `;
      }
      
      // 下一页按钮
      html += `
        <li class="page-item ${current === total ? 'disabled' : ''}">
          <a class="page-link" href="#" data-page="${current + 1}">下一页</a>
        </li>
      `;
      
      html += '</ul>';
      
      paginationContainer.innerHTML = html;
      
      // 绑定分页点击事件
      const pageLinks = paginationContainer.querySelectorAll('.page-link');
      pageLinks.forEach(link => {
        if (!link.parentElement.classList.contains('disabled') && !link.parentElement.classList.contains('active')) {
          link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = parseInt(this.getAttribute('data-page'));
            if (page && page !== currentPage) {
              currentPage = page;
              loadRecords();
            }
          });
        }
      });
    }
    
    // 显示统计信息
    function displayStats(stats) {
      const statsContainer = document.getElementById('records-stats');
      if (!statsContainer) return;
      
      statsContainer.innerHTML = `
        <div class="stat-card">
          <div class="stat-title">总记录数</div>
          <div class="stat-value">${stats.total}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">成功发货</div>
          <div class="stat-value">${stats.completed}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">处理中</div>
          <div class="stat-value">${stats.pending}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">失败</div>
          <div class="stat-value">${stats.failed}</div>
        </div>
      `;
    }
    
    // 查看记录详情
    function showRecordDetails(recordId) {
      window.apiRequest(`/admin/api/records/${recordId}`)
        .then(data => {
          if (data.success) {
            const record = data.record;
            
            const detailsHtml = `
              <div class="record-details">
                <h3>提货详情</h3>
                
                <div class="detail-row">
                  <div class="detail-label">提货码:</div>
                  <div class="detail-value">${record.code}</div>
                </div>
                
                <div class="detail-row">
                  <div class="detail-label">游戏:</div>
                  <div class="detail-value">${record.game ? record.game.name : '未知游戏'}</div>
                </div>
                
                <div class="detail-row">
                  <div class="detail-label">Steam ID:</div>
                  <div class="detail-value">${record.steamId || '未提供'}</div>
                </div>
                
                <div class="detail-row">
                  <div class="detail-label">Steam URL:</div>
                  <div class="detail-value">
                    <a href="${record.steamUrl}" target="_blank">${record.steamUrl}</a>
                  </div>
                </div>
                
                <div class="detail-row">
                  <div class="detail-label">状态:</div>
                  <div class="detail-value">
                    <span class="status-badge ${getStatusClass(record.status)}">
                      ${getStatusText(record.status)}
                    </span>
                  </div>
                </div>
                
                <div class="detail-row">
                  <div class="detail-label">创建时间:</div>
                  <div class="detail-value">${formatDateTime(record.createdAt)}</div>
                </div>
                
                <div class="detail-row">
                  <div class="detail-label">完成时间:</div>
                  <div class="detail-value">${record.completedAt ? formatDateTime(record.completedAt) : '未完成'}</div>
                </div>
                
                ${record.errorMessage ? `
                  <div class="detail-row">
                    <div class="detail-label">错误信息:</div>
                    <div class="detail-value error-message">${record.errorMessage}</div>
                  </div>
                ` : ''}
                
                <div class="detail-actions">
                  <button class="btn-close-details">关闭</button>
                  ${record.status === 'failed' ? `
                    <button class="btn-retry" data-record-id="${record._id}">重试</button>
                  ` : ''}
                </div>
              </div>
            `;
            
            // 创建模态框
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
              <div class="modal-content">
                <span class="modal-close">&times;</span>
                ${detailsHtml}
              </div>
            `;
            
            document.body.appendChild(modal);
            
            // 显示模态框
            setTimeout(() => {
              modal.classList.add('show');
            }, 10);
            
            // 关闭模态框
            const closeBtn = modal.querySelector('.modal-close');
            const closeBtnDetails = modal.querySelector('.btn-close-details');
            
            if (closeBtn) {
              closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
                setTimeout(() => {
                  document.body.removeChild(modal);
                }, 300);
              });
            }
            
            if (closeBtnDetails) {
              closeBtnDetails.addEventListener('click', function() {
                modal.classList.remove('show');
                setTimeout(() => {
                  document.body.removeChild(modal);
                }, 300);
              });
            }
            
            // 重试按钮
            const retryBtn = modal.querySelector('.btn-retry');
            if (retryBtn) {
              retryBtn.addEventListener('click', function() {
                const recordId = this.getAttribute('data-record-id');
                retryRedemption(recordId, modal);
              });
            }
          } else {
            showError(data.message || '加载记录详情失败');
          }
        })
        .catch(error => {
          console.error('Error loading record details:', error);
          showError('加载记录详情出错，请稍后重试');
        });
    }
    
    // 重试发货
    function retryRedemption(recordId, modal) {
      window.apiRequest(`/admin/api/records/${recordId}/retry`, 'POST')
        .then(data => {
          if (data.success) {
            // 关闭模态框
            modal.classList.remove('show');
            setTimeout(() => {
              document.body.removeChild(modal);
            }, 300);
            
            // 显示成功消息
            window.showNotification('已重新开始处理提货请求', 'success');
            
            // 重新加载记录
            loadRecords();
          } else {
            showError(data.message || '重试失败');
          }
        })
        .catch(error => {
          console.error('Error retrying redemption:', error);
          showError('重试出错，请稍后再试');
        });
    }
    
    // 显示错误消息
    function showError(message) {
      window.showNotification(message, 'error');
    }
    
    // 格式化日期
    function formatDate(dateString) {
      if (!dateString) return '-';
      const date = new Date(dateString);
      return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
    }
    
    // 格式化日期时间
    function formatDateTime(dateString) {
      if (!dateString) return '-';
      const date = new Date(dateString);
      return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:${padZero(date.getMinutes())}:${padZero(date.getSeconds())}`;
    }
    
    // 补零
    function padZero(num) {
      return num < 10 ? `0${num}` : num;
    }
    
    // 获取状态类
    function getStatusClass(status) {
      switch (status) {
        case 'completed':
          return 'status-success';
        case 'failed':
          return 'status-error';
        default:
          return 'status-pending';
      }
    }
    
    // 获取状态文本
    function getStatusText(status) {
      switch (status) {
        case 'pending':
          return '等待处理';
        case 'friend_added':
          return '已添加好友';
        case 'gift_sent':
          return '礼物已发送';
        case 'completed':
          return '已完成';
        case 'failed':
          return '失败';
        default:
          return status;
      }
    }
  });
  