document.addEventListener('DOMContentLoaded', function() {
  const lastCodeElement = document.getElementById('lastCode');
  const copyIcon = document.getElementById('copyIcon');
  const recordHistoryCheckbox = document.getElementById('recordHistory');
  const showNotificationsCheckbox = document.getElementById('showNotifications');
  const darkModeCheckbox = document.getElementById('darkMode');
  const codeHistoryElement = document.getElementById('codeHistory');
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsPanel = document.getElementById('settingsPanel');
  const viewHistoryButton = document.getElementById('viewHistory');
  const statusIndicator = document.getElementById('statusIndicator');
  
  updateStatusIndicator();
  // Check status every 5 seconds
  setInterval(updateStatusIndicator, 5000);

  // Load settings and last code
  chrome.storage.local.get(['lastCode', 'codeHistory', 'recordHistory', 'showNotifications', 'darkMode'], function(result) {
      if (result.lastCode) {
          lastCodeElement.textContent = result.lastCode;
      }
      recordHistoryCheckbox.checked = result.recordHistory !== false;
      showNotificationsCheckbox.checked = result.showNotifications !== false;
      darkModeCheckbox.checked = result.darkMode === true;
      applyDarkMode(result.darkMode === true);

      // Update Code History UI based on recordHistory setting
      updateCodeHistoryUI(result.recordHistory !== false, result.codeHistory);
  });

  // Copy functionality
  copyIcon.addEventListener('click', function() {
      const code = lastCodeElement.textContent;
      if (code !== 'None') {
          navigator.clipboard.writeText(code).then(function() {
              // Visual feedback
              copyIcon.style.color = 'var(--highlight-color)';
              setTimeout(() => {
                  copyIcon.style.color = '';
              }, 1000);
          }).catch(function(err) {
              console.error('Failed to copy text: ', err);
          });
      }
  });

  // Settings change listeners
  recordHistoryCheckbox.addEventListener('change', function() {
      const isChecked = this.checked;
      chrome.storage.local.set({recordHistory: isChecked}, function() {
          if (!isChecked) {
              // Clear code history when unchecked
              chrome.storage.local.remove(['codeHistory'], function() {
                  updateCodeHistoryUI(false);
              });
          } else {
              updateCodeHistoryUI(true);
          }
      });
  });

  showNotificationsCheckbox.addEventListener('change', function() {
      chrome.storage.local.set({showNotifications: this.checked});
  });

  darkModeCheckbox.addEventListener('change', function() {
      const isDarkMode = this.checked;
      chrome.storage.local.set({darkMode: isDarkMode});
      applyDarkMode(isDarkMode);
  });

  // Toggle settings panel
  settingsToggle.addEventListener('click', function() {
      settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
  });

  // View history button
  viewHistoryButton.addEventListener('click', function() {
      if (!recordHistoryCheckbox.checked) return; // Do nothing if record history is off

      if (codeHistoryElement.style.display === 'none' || codeHistoryElement.style.display === '') {
          chrome.storage.local.get(['codeHistory'], function(result) {
              updateCodeHistory(result.codeHistory || []);
              codeHistoryElement.style.display = 'block';
              viewHistoryButton.textContent = 'Hide';
          });
      } else {
          codeHistoryElement.style.display = 'none';
          viewHistoryButton.textContent = 'View';
      }
  });

  function updateCodeHistory(history) {
      if (!codeHistoryElement) return;
      codeHistoryElement.innerHTML = '';
      if (history.length > 0) {
          history.slice(0, 5).forEach(codeObj => {
              const div = document.createElement('div');
              div.textContent = `${codeObj.code} (${codeObj.platform || 'Unknown'})`;
              div.className = 'code-history-item';
              codeHistoryElement.appendChild(div);
          });
      } else {
          codeHistoryElement.textContent = 'No recent codes';
      }
  }

  function updateCodeHistoryUI(isEnabled, history) {
      viewHistoryButton.disabled = !isEnabled;
      viewHistoryButton.style.opacity = isEnabled ? '1' : '0.5';
      if (!isEnabled) {
          codeHistoryElement.style.display = 'none';
          viewHistoryButton.textContent = 'View';
      } else if (history && history.length > 0) {
          updateCodeHistory(history);
      }
  }

  function applyDarkMode(isDarkMode) {
      document.body.classList.toggle('dark-mode', isDarkMode);
  }

  function updateStatusIndicator() {
    const statusIndicator = document.getElementById('statusIndicator');
    if (!statusIndicator) return;

    chrome.runtime.sendMessage({action: "getContentScriptStatus"}, function(response) {
        if (chrome.runtime.lastError) {
            console.error('Error checking content script status:', chrome.runtime.lastError);
            statusIndicator.classList.remove('status-active');
            statusIndicator.classList.add('status-inactive');
            statusIndicator.title = 'Error checking content script status';
            return;
        }

        if (response && response.active) {
            statusIndicator.classList.remove('status-inactive');
            statusIndicator.classList.add('status-active');
            statusIndicator.title = 'Content script is active';
        } else {
            statusIndicator.classList.remove('status-active');
            statusIndicator.classList.add('status-inactive');
            statusIndicator.title = 'Content script is inactive';
        }
    });
  }

  // Initially hide settings panel and code history
  settingsPanel.style.display = 'none';
  codeHistoryElement.style.display = 'none';
});