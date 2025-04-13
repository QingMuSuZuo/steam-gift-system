document.addEventListener('DOMContentLoaded', function() {
    const redemptionForm = document.getElementById('redemption-form');
    const statusArea = document.getElementById('status-area');
    const statusSteps = document.getElementById('status-steps');
    
    if (redemptionForm) {
      redemptionForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const codeInput = document.getElementById('code');
        const steamUrlInput = document.getElementById('steam-url');
        
        if (!codeInput.value.trim()) {
          showError('请输入提货码');
          return;
        }
        
        if (!steamUrlInput.value.trim()) {
          showError('请输入Steam链接或ID');
          return;
        }
        
        // 显示状态区域
        statusArea.style.display = 'block';
        
        // 更新第一步状态为处理中
        updateStepStatus('verify-code', 'pending', '正在验证提货码...');
        
        // 发送API请求
        fetch('/redeem', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: codeInput.value.trim(),
            steamUrl: steamUrlInput.value.trim()
          })
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            // 更新提货码验证步骤为成功
            updateStepStatus('verify-code', 'success', '提货码验证成功');
            
            // 添加好友步骤
            updateStepStatus('add-friend', 'pending', '正在添加Steam好友，请留意您的Steam好友请求...');
            
            // 开始轮询检查好友添加状态
            pollFriendStatus(data.redemptionId);
          } else {
            updateStepStatus('verify-code', 'error', data.message || '提货码验证失败');
          }
        })
        .catch(error => {
          console.error('Error:', error);
          updateStepStatus('verify-code', 'error', '提交过程中出现错误，请稍后重试');
        });
      });
    }
    
    function updateStepStatus(stepId, status, message) {
      const stepItem = document.getElementById(`step-${stepId}`);
      if (stepItem) {
        // 移除所有状态类
        stepItem.classList.remove('pending', 'success', 'error');
        // 添加新的状态类
        stepItem.classList.add(status);
        // 更新消息
        stepItem.textContent = message;
      } else {
        // 如果步骤不存在，创建一个新的
        const newStep = document.createElement('li');
        newStep.id = `step-${stepId}`;
        newStep.classList.add(status);
        newStep.textContent = message;
        statusSteps.appendChild(newStep);
      }
    }
    
    function showError(message) {
      const errorMsg = document.getElementById('error-message');
      errorMsg.textContent = message;
      errorMsg.style.display = 'block';
      
      setTimeout(() => {
        errorMsg.style.display = 'none';
      }, 3000);
    }
    
    function pollFriendStatus(redemptionId) {
      let pollInterval = setInterval(() => {
        fetch(`/redeem/status/${redemptionId}`)
          .then(response => response.json())
          .then(data => {
            if (data.status === 'friend_added') {
              clearInterval(pollInterval);
              updateStepStatus('add-friend', 'success', '好友添加成功');
              updateStepStatus('confirm-friend', 'pending', '请点击下一步确认已接受好友请求');
              
              // 显示确认按钮
              showConfirmButton(redemptionId);
            } else if (data.status === 'failed') {
              clearInterval(pollInterval);
              updateStepStatus('add-friend', 'error', data.errorMessage || '添加好友失败，请确认您的Steam链接是否正确');
            }
          })
          .catch(error => {
            console.error('Error polling status:', error);
          });
      }, 5000); // 每5秒检查一次
      
      // 30分钟后停止轮询
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 30 * 60 * 1000);
    }
    
    function showConfirmButton(redemptionId) {
      const confirmButtonContainer = document.createElement('div');
      confirmButtonContainer.className = 'confirm-button-container';
      confirmButtonContainer.innerHTML = `
        <p>已收到Steam好友请求？请确认已接受请求。</p>
        <button id="confirm-friend-btn" class="button">我已接受好友请求，继续</button>
      `;
      
      statusArea.appendChild(confirmButtonContainer);
      
      document.getElementById('confirm-friend-btn').addEventListener('click', function() {
        this.disabled = true;
        this.textContent = '处理中...';
        
        updateStepStatus('confirm-friend', 'pending', '正在确认好友状态...');
        
        fetch(`/redeem/confirm/${redemptionId}`, {
          method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            updateStepStatus('confirm-friend', 'success', '好友确认成功');
            updateStepStatus('send-gift', 'pending', '正在发送游戏礼物，请留意您的Steam礼物通知...');
            
            // 轮询礼物发送状态
            pollGiftStatus(redemptionId);
          } else {
            updateStepStatus('confirm-friend', 'error', data.message || '好友确认失败');
            this.disabled = false;
            this.textContent = '重试';
          }
        })
        .catch(error => {
          console.error('Error:', error);
          updateStepStatus('confirm-friend', 'error', '确认过程中出现错误，请稍后重试');
          this.disabled = false;
          this.textContent = '重试';
        });
      });
    }
    
    function pollGiftStatus(redemptionId) {
      let pollInterval = setInterval(() => {
        fetch(`/redeem/status/${redemptionId}`)
          .then(response => response.json())
          .then(data => {
            if (data.status === 'gift_sent') {
              updateStepStatus('send-gift', 'success', '礼物已发送，请检查您的Steam通知');
              updateStepStatus('complete', 'pending', '正在等待您确认接收礼物...');
            } else if (data.status === 'completed') {
              clearInterval(pollInterval);
              updateStepStatus('complete', 'success', '提货完成！感谢您的使用。');
              showCompletionMessage();
            } else if (data.status === 'failed') {
              clearInterval(pollInterval);
              updateStepStatus('send-gift', 'error', data.errorMessage || '发送礼物失败');
            }
          })
          .catch(error => {
            console.error('Error polling gift status:', error);
          });
      }, 5000); // 每5秒检查一次
      
      // 30分钟后停止轮询
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 30 * 60 * 1000);
    }
    
    function showCompletionMessage() {
      const completionMessage = document.createElement('div');
      completionMessage.className = 'completion-message';
      completionMessage.innerHTML = `
        <h2>提货成功！</h2>
        <p>您的游戏礼物已成功发送至您的Steam账户。</p>
        <p>如有任何问题，请联系客服。</p>
      `;
      
      statusArea.appendChild(completionMessage);
      
      // 隐藏表单
      redemptionForm.style.display = 'none';
    }
  });
  