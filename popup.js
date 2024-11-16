document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const videoInfo = document.querySelector('.video-info');
    const setupPanel = document.getElementById('setupPanel');
    const monitoringPanel = document.getElementById('monitoringPanel');

    let startTime = null;
    let monitoringInterval = null;

    // Initialize state
    chrome.storage.local.get(['isMonitoring', 'startTime'], (data) => {
        if (data.isMonitoring) {
            startMonitoring(data.startTime);
        }
    });

    // Function to check if current tab is a YouTube playlist
    function getCurrentTab() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs[0]);
            });
        });
    }

    // Function to ensure content script is injected
    function injectContentScript(tabId) {
        return new Promise((resolve, reject) => {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            })
            .then(() => resolve())
            .catch((error) => {
                console.error('Script injection error:', error);
                reject(error);
            });
        });
    }

    // Function to analyze playlist
    function analyzePlaylist(tabId) {
        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(
                tabId,
                { action: 'analyzePlaylist' },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                }
            );
        });
    }

    // Handle analyze button click
    analyzeBtn.addEventListener('click', () => {
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Analyzing...';

        getCurrentTab()
            .then(tab => {
                if (!tab.url || !tab.url.includes('youtube.com')) {
                    throw new Error('Please navigate to YouTube first!');
                }
                return tab;
            })
            .then(tab => {
                return injectContentScript(tab.id)
                    .then(() => analyzePlaylist(tab.id))
                    .catch(() => analyzePlaylist(tab.id));
            })
            .then(analysis => {
                if (analysis.error) {
                    throw new Error(analysis.message);
                }
                displayAnalysis(analysis);
                setupPanel.style.display = 'none';
                monitoringPanel.style.display = 'block';
                videoInfo.classList.add('active');
            })
            .catch(error => {
                console.error('Error:', error);
                alert(error.message || 'Error analyzing playlist. Please make sure you are on a YouTube playlist page.');
            })
            .finally(() => {
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = 'Analyze Playlist';
            });
    });

    function displayAnalysis(analysis) {
        document.getElementById('videoTitle').textContent = analysis.title || 'Unknown Playlist';
        
        const recommendationEl = document.getElementById('aiRecommendation');
        recommendationEl.textContent = analysis.recommendation?.message || 'No recommendation available';
        recommendationEl.className = `recommendation ${analysis.recommendation?.type || 'neutral'}`;
        
        document.getElementById('focusScore').textContent = `${analysis.educationalScore || 0}%`;
    }

    startBtn.addEventListener('click', () => {
        getCurrentTab().then(tab => {
            if (!tab.url || !tab.url.includes('youtube.com')) {
                alert('Please navigate to YouTube first!');
                return;
            }

            startTime = Date.now();
            
            chrome.storage.local.set({
                isMonitoring: true,
                startTime: startTime
            });

            chrome.tabs.sendMessage(tab.id, { action: 'startMonitoring' });
            startMonitoring(startTime);
        });
    });

    stopBtn.addEventListener('click', () => {
        getCurrentTab().then(tab => {
            if (!tab.url || !tab.url.includes('youtube.com')) {
                alert('Please navigate to YouTube first!');
                return;
            }
            
            chrome.storage.local.set({
                isMonitoring: false,
                startTime: null
            });

            chrome.tabs.sendMessage(tab.id, { action: 'stopMonitoring' });
            stopMonitoring();
        });
    });

    function startMonitoring(time) {
        startTime = time;
        monitoringInterval = setInterval(updateStudyTime, 1000);
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
    }

    function stopMonitoring() {
        clearInterval(monitoringInterval);
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
    }

    function updateStudyTime() {
        if (!startTime) return;
        
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('studyTime').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    // Add this to your popup.js
document.addEventListener('DOMContentLoaded', () => {
    // ... your existing code ...

    // Break settings elements
    const breakIntervalSelect = document.getElementById('breakInterval');
    const breakDurationSelect = document.getElementById('breakDuration');
    const customIntervalInput = document.getElementById('customIntervalInput');
    const customDurationInput = document.getElementById('customDurationInput');
    const customMinutes = document.getElementById('customMinutes');
    const customBreakMinutes = document.getElementById('customBreakMinutes');
    const saveSettings = document.getElementById('saveSettings');

    // Load saved settings
    chrome.storage.local.get([
        'breakInterval',
        'breakDuration',
        'customInterval',
        'customDuration'
    ], (data) => {
        if (data.breakInterval) {
            breakIntervalSelect.value = data.breakInterval;
            if (data.breakInterval === 'custom') {
                customIntervalInput.style.display = 'flex';
                customMinutes.value = data.customInterval || 180;
            }
        }
        if (data.breakDuration) {
            breakDurationSelect.value = data.breakDuration;
            if (data.breakDuration === 'custom') {
                customDurationInput.style.display = 'flex';
                customBreakMinutes.value = data.customDuration || 15;
            }
        }
    });

    // Handle custom interval selection
    breakIntervalSelect.addEventListener('change', () => {
        customIntervalInput.style.display = 
            breakIntervalSelect.value === 'custom' ? 'flex' : 'none';
    });

    // Handle custom duration selection
    breakDurationSelect.addEventListener('change', () => {
        customDurationInput.style.display = 
            breakDurationSelect.value === 'custom' ? 'flex' : 'none';
    });

    // Save settings
    saveSettings.addEventListener('click', () => {
        const settings = {
            breakInterval: breakIntervalSelect.value,
            breakDuration: breakDurationSelect.value,
            customInterval: parseInt(customMinutes.value),
            customDuration: parseInt(customBreakMinutes.value)
        };

        chrome.storage.local.set(settings, () => {
            showAlert('info', 'Break settings saved!', 2000);
            
            // Update content script with new settings
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'updateBreakSettings',
                    settings: settings
                });
            });
        });
    });
});

// Add this function to show alerts in popup
function showAlert(type, message, duration) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alert.style.cssText = `
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 20px;
        border-radius: 4px;
        background: #cce5ff;
        color: #004085;
        z-index: 1000;
    `;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), duration);
}
});