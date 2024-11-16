// Global variables
let isMonitoring = false;
let currentPlaylistId = null;
let approvedPlaylists = new Set();
let lastVideoId = null;
let activeAlert = null;
// Add these to your global variables at the top
let studyStartTime = null;
let lastBreakTime = null;
let breakInterval = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
let isOnBreak = false;
let breakDuration = 15 * 60 * 1000; // 15 minutes in milliseconds

// Function to format time duration
function formatDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
}

// Function to show break suggestion
function suggestBreak() {
    if (isOnBreak) return;

    const studyDuration = Date.now() - studyStartTime;
    
    showAlert(
        'info',
        `You've been studying for ${formatDuration(studyDuration)}. Taking regular breaks improves focus and retention!`,
        0, // Won't auto-dismiss
        {
            text: 'Take a 15min Break',
            callback: startBreak
        }
    );
    playBeep();
}

// Function to start break
function startBreak() {
    isOnBreak = true;
    lastBreakTime = Date.now();
    
    // Save state
    chrome.storage.local.set({
        isOnBreak: true,
        lastBreakTime: lastBreakTime
    });

    showAlert(
        'info',
        'Break started! Take 15 minutes to stretch, rest your eyes, or grab a snack.',
        0,
        {
            text: 'End Break Early',
            callback: endBreak
        }
    );

    // Schedule break end
    setTimeout(checkBreakEnd, breakDuration);
}

// Function to check if break should end
function checkBreakEnd() {
    if (isOnBreak && Date.now() - lastBreakTime >= breakDuration) {
        endBreak();
    }
}

// Function to end break
function endBreak() {
    isOnBreak = false;
    lastBreakTime = Date.now();
    
    // Save state
    chrome.storage.local.set({
        isOnBreak: false,
        lastBreakTime: lastBreakTime
    });

    showAlert(
        'info',
        'Break time is over! Ready to continue studying?',
        8000,
        {
            text: 'Resume Studying',
            callback: () => {
                if (lastPlaylistVideo.videoId) {
                    returnToStudyPlaylist();
                }
            }
        }
    );
    playBeep();
}

// Function to check study time and suggest breaks
function checkStudyTime() {
    if (!isMonitoring || isOnBreak) return;

    const now = Date.now();
    const timeSinceStart = now - studyStartTime;
    const timeSinceBreak = lastBreakTime ? now - lastBreakTime : timeSinceStart;

    if (timeSinceBreak >= breakInterval) {
        suggestBreak();
    }
}

// Update the monitoring function
async function monitorNavigation() {
    if (!isMonitoring) return;

    const newPlaylistId = getPlaylistId();
    const currentVideoId = getVideoId();
    
    // Check study time and suggest breaks
    checkStudyTime();

    // Update last known position when in playlist
    if (isInPlaylist() && currentVideoId) {
        updateLastPosition();
    }

    // Case 1: User left the playlist entirely
    if (!isInPlaylist() && lastPlaylistVideo.playlistId && !isOnBreak) {
        playBeep();
        showAlert(
            'warning', 
            'You have navigated away from your study video!', 
            15000, 
            {
                text: 'Return to Previous Video',
                callback: returnToStudyPlaylist
            }
        );
        return;
    }

    // Case 2: Playlist changed
    if (hasPlaylistChanged() && !isOnBreak) {
        playBeep();
        const confirmed = await showConfirmationDialog(newPlaylistId);
        
        if (confirmed) {
            currentPlaylistId = newPlaylistId;
            approvedPlaylists.add(newPlaylistId);
            updateLastPosition();
            showAlert('info', 'Switching to new playlist. Stay focused on your studies!', 5000);
        } else {
            showAlert(
                'info', 
                'Returning to your previous study video...', 
                3000, 
                {
                    text: 'Return Now',
                    callback: returnToStudyPlaylist
                }
            );
        }
    }

    // Continue monitoring
    setTimeout(monitorNavigation, 1000);
}

// Update the message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request);

    switch (request.action) {
        case 'analyzePlaylist':
            analyzePlaylist().then(sendResponse);
            return true;

        case 'startMonitoring':
            isMonitoring = true;
            studyStartTime = Date.now();
            currentPlaylistId = getPlaylistId();
            
            // Initialize or restore break state
            chrome.storage.local.get(['isOnBreak', 'lastBreakTime'], (data) => {
                isOnBreak = data.isOnBreak || false;
                lastBreakTime = data.lastBreakTime || null;
                
                if (currentPlaylistId) {
                    approvedPlaylists.add(currentPlaylistId);
                    updateLastPosition();
                    showAlert('info', 'Study Focus monitoring started. Break suggestions enabled!', 5000);
                }
            });
            
            monitorNavigation();
            sendResponse({ success: true });
            break;

        case 'stopMonitoring':
            isMonitoring = false;
            studyStartTime = null;
            isOnBreak = false;
            showAlert('info', 'Study Focus monitoring stopped.', 5000);
            sendResponse({ success: true });
            break;
    }
});

// Add study statistics to popup
function updateStudyStats() {
    if (!isMonitoring || !studyStartTime) return;

    const totalStudyTime = Date.now() - studyStartTime;
    const formattedTime = formatDuration(totalStudyTime);
    
    const statsDiv = document.getElementById('studyTime');
    if (statsDiv) {
        statsDiv.textContent = formattedTime;
        
        if (isOnBreak) {
            const breakTimeLeft = breakDuration - (Date.now() - lastBreakTime);
            if (breakTimeLeft > 0) {
                statsDiv.textContent += ` (Break: ${Math.ceil(breakTimeLeft / 1000 / 60)}min left)`;
            }
        }
    }
}

// Update the timer display more frequently
setInterval(updateStudyStats, 1000);
// Create audio context for web-based sound
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioContext = new AudioContext();

// Function to create and show alert
function showAlert(type, message, duration = 5000) {
    // Remove existing alert if any
    if (activeAlert) {
        activeAlert.remove();
    }

    const alert = document.createElement('div');
    const colors = {
        warning: {
            bg: '#fff3cd',
            border: '#ffeeba',
            text: '#856404'
        },
        info: {
            bg: '#cce5ff',
            border: '#b8daff',
            text: '#004085'
        },
        danger: {
            bg: '#f8d7da',
            border: '#f5c6cb',
            text: '#721c24'
        }
    };

    const color = colors[type] || colors.info;

    alert.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background-color: ${color.bg};
        border: 1px solid ${color.border};
        border-left: 5px solid ${color.text};
        color: ${color.text};
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 9999999;
        font-family: Arial, sans-serif;
        font-size: 14px;
        max-width: 350px;
        animation: slideIn 0.5s ease-out;
    `;

    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
        position: absolute;
        right: 5px;
        top: 5px;
        background: none;
        border: none;
        color: ${color.text};
        font-size: 20px;
        cursor: pointer;
        padding: 0 5px;
    `;

    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.style.paddingRight = '20px';

    alert.appendChild(closeButton);
    alert.appendChild(messageDiv);

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    closeButton.onclick = () => {
        alert.style.animation = 'slideOut 0.5s ease-out';
        setTimeout(() => alert.remove(), 500);
        activeAlert = null;
    };

    document.body.appendChild(alert);
    activeAlert = alert;

    if (duration) {
        setTimeout(() => {
            if (alert.parentNode) {
                alert.style.animation = 'slideOut 0.5s ease-out';
                setTimeout(() => {
                    if (alert.parentNode) {
                        alert.remove();
                        activeAlert = null;
                    }
                }, 500);
            }
        }, duration);
    }

    return alert;
}

// Function to generate and play a beep sound
async function playBeep() {
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        console.error('Error playing beep:', error);
    }
}

// Function to generate recommendation based on score
function generateRecommendation(score) {
    if (score >= 60) {
        return {
            message: "This playlist appears to be highly educational and suitable for studying.",
            type: "positive"
        };
    } else if (score >= 40) {
        return {
            message: "This playlist contains educational content. Stay focused on the learning material.",
            type: "neutral"
        };
    } else {
        return {
            message: "This playlist may contain limited educational content. Consider if it aligns with your study goals.",
            type: "warning"
        };
    }
}

// Function to analyze playlist
async function analyzePlaylist() {
    const playlistId = getPlaylistId();
    if (!playlistId) {
        return {
            error: true,
            message: 'No playlist found. Please open a YouTube playlist.'
        };
    }

    const playlistTitle = document.querySelector('yt-formatted-string.title.style-scope.ytd-playlist-panel-renderer')?.textContent?.trim() || 'Unknown Playlist';
    const videoCount = document.querySelectorAll('ytd-playlist-panel-video-renderer').length;

    const videoTitles = Array.from(document.querySelectorAll('span#video-title'))
        .map(el => el.textContent.trim());

    const educationalKeywords = [
        'lecture', 'tutorial', 'course', 'learn', 'education',
        'study', 'academic', 'lesson', 'university', 'school',
        'teaching', 'explanation', 'guide', 'programming', 'development',
        'training', 'introduction', 'basics', 'advanced', 'workshop'
    ];

    let totalScore = 0;
    videoTitles.forEach(title => {
        const titleLower = title.toLowerCase();
        educationalKeywords.forEach(keyword => {
            if (titleLower.includes(keyword)) totalScore++;
        });
    });

    const averageScore = videoTitles.length > 0 ? (totalScore / videoTitles.length) * 20 : 0;
    const educationalScore = Math.min(100, averageScore);

    return {
        playlistId,
        title: playlistTitle,
        videoCount,
        educationalScore,
        isEducational: educationalScore >= 40,
        recommendation: generateRecommendation(educationalScore)
    };
}

// Helper functions
function getPlaylistId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('list');
}

function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

// Function to check if we're still in a playlist context
function isInPlaylist() {
    return !!getPlaylistId();
}

// Function to check if playlist changed
function hasPlaylistChanged() {
    const newPlaylistId = getPlaylistId();
    return newPlaylistId && newPlaylistId !== currentPlaylistId;
}

// Function to create and show confirmation dialog
function showConfirmationDialog(newPlaylistId) {
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 9999;
            max-width: 300px;
            font-family: Arial, sans-serif;
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 10px 0; color: #333;">Playlist Change Detected</h3>
            <p style="margin: 0 0 15px 0; color: #666;">You're switching to a different playlist. Would you like to continue?</p>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="cancelBtn" style="padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; background: #ddd;">Cancel</button>
                <button id="confirmBtn" style="padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; background: #4CAF50; color: white;">Continue</button>
            </div>
        `;

        document.body.appendChild(dialog);

        const confirmBtn = dialog.querySelector('#confirmBtn');
        const cancelBtn = dialog.querySelector('#cancelBtn');

        confirmBtn.addEventListener('click', () => {
            document.body.removeChild(dialog);
            resolve(true);
        });

        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(dialog);
            resolve(false);
        });

        // Auto-dismiss after 10 seconds
        setTimeout(() => {
            if (document.body.contains(dialog)) {
                document.body.removeChild(dialog);
                resolve(false);
            }
        }, 10000);
    });
}

// Function to monitor navigation
async function monitorNavigation() {
    if (!isMonitoring) return;

    const newPlaylistId = getPlaylistId();
    
    // Case 1: User left the playlist entirely
    if (!isInPlaylist() && currentPlaylistId) {
        playBeep();
        showAlert('warning', 'You have navigated away from your study playlist. Would you like to return?', 8000);
        return;
    }

    // Case 2: Playlist changed
    if (hasPlaylistChanged()) {
        playBeep();
        const confirmed = await showConfirmationDialog(newPlaylistId);
        
        if (confirmed) {
            currentPlaylistId = newPlaylistId;
            approvedPlaylists.add(newPlaylistId);
            showAlert('info', 'Switching to new playlist. Stay focused on your studies!', 5000);
        } else {
            // If not confirmed, try to navigate back to the previous playlist
            if (currentPlaylistId) {
                const currentVideoId = getVideoId();
                const newUrl = currentVideoId 
                    ? `https://www.youtube.com/watch?v=${currentVideoId}&list=${currentPlaylistId}`
                    : `https://www.youtube.com/playlist?list=${currentPlaylistId}`;
                window.location.href = newUrl;
                showAlert('info', 'Returning to previous playlist...', 3000);
            }
        }
    }

    // Continue monitoring
    setTimeout(monitorNavigation, 1000);
}

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request);

    switch (request.action) {
        case 'analyzePlaylist':
            analyzePlaylist().then(sendResponse);
            return true;

        case 'startMonitoring':
            isMonitoring = true;
            currentPlaylistId = getPlaylistId();
            if (currentPlaylistId) {
                approvedPlaylists.add(currentPlaylistId);
                showAlert('info', 'Study Focus monitoring started. Stay focused!', 5000);
            }
            monitorNavigation();
            sendResponse({ success: true });
            break;

        case 'stopMonitoring':
            isMonitoring = false;
            showAlert('info', 'Study Focus monitoring stopped.', 5000);
            sendResponse({ success: true });
            break;
    }
});

// Initialize monitoring for URL changes
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        if (isMonitoring) {
            monitorNavigation();
        }
    }
}).observe(document, { subtree: true, childList: true });
// Function to create and show alert with optional action button
function showAlert(type, message, duration = 5000, action = null) {
    // Remove existing alert if any
    if (activeAlert) {
        activeAlert.remove();
    }

    const alert = document.createElement('div');
    const colors = {
        warning: {
            bg: '#fff3cd',
            border: '#ffeeba',
            text: '#856404',
            button: '#856404'
        },
        info: {
            bg: '#cce5ff',
            border: '#b8daff',
            text: '#004085',
            button: '#004085'
        },
        danger: {
            bg: '#f8d7da',
            border: '#f5c6cb',
            text: '#721c24',
            button: '#721c24'
        }
    };

    const color = colors[type] || colors.info;

    alert.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background-color: ${color.bg};
        border: 1px solid ${color.border};
        border-left: 5px solid ${color.text};
        color: ${color.text};
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 9999999;
        font-family: Arial, sans-serif;
        font-size: 14px;
        max-width: 350px;
        animation: slideIn 0.5s ease-out;
    `;

    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
        position: absolute;
        right: 5px;
        top: 5px;
        background: none;
        border: none;
        color: ${color.text};
        font-size: 20px;
        cursor: pointer;
        padding: 0 5px;
    `;

    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.style.paddingRight = '20px';

    alert.appendChild(closeButton);
    alert.appendChild(messageDiv);

    // Add action button if provided
    if (action) {
        const actionButton = document.createElement('button');
        actionButton.textContent = action.text;
        actionButton.style.cssText = `
            margin-top: 10px;
            padding: 5px 15px;
            background-color: ${color.button};
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: opacity 0.2s;
        `;
        actionButton.onmouseover = () => actionButton.style.opacity = '0.8';
        actionButton.onmouseout = () => actionButton.style.opacity = '1';
        actionButton.onclick = () => {
            action.callback();
            alert.remove();
            activeAlert = null;
        };
        alert.appendChild(actionButton);
    }

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    closeButton.onclick = () => {
        alert.style.animation = 'slideOut 0.5s ease-out';
        setTimeout(() => alert.remove(), 500);
        activeAlert = null;
    };

    document.body.appendChild(alert);
    activeAlert = alert;

    if (duration) {
        setTimeout(() => {
            if (alert.parentNode) {
                alert.style.animation = 'slideOut 0.5s ease-out';
                setTimeout(() => {
                    if (alert.parentNode) {
                        alert.remove();
                        activeAlert = null;
                    }
                }, 500);
            }
        }, duration);
    }

    return alert;
}

// Function to return to the study playlist
function returnToStudyPlaylist() {
    if (currentPlaylistId) {
        const currentVideoId = getVideoId();
        const newUrl = currentVideoId 
            ? `https://www.youtube.com/watch?v=${currentVideoId}&list=${currentPlaylistId}`
            : `https://www.youtube.com/playlist?list=${currentPlaylistId}`;
        window.location.href = newUrl;
    }
}

// Update the monitoring function
async function monitorNavigation() {
    if (!isMonitoring) return;

    const newPlaylistId = getPlaylistId();
    
    // Case 1: User left the playlist entirely
    if (!isInPlaylist() && currentPlaylistId) {
        playBeep();
        showAlert(
            'warning', 
            'You have navigated away from your study playlist!', 
            15000, 
            {
                text: 'Return to Study Playlist',
                callback: returnToStudyPlaylist
            }
        );
        return;
    }

    // Case 2: Playlist changed
    if (hasPlaylistChanged()) {
        playBeep();
        const confirmed = await showConfirmationDialog(newPlaylistId);
        
        if (confirmed) {
            currentPlaylistId = newPlaylistId;
            approvedPlaylists.add(newPlaylistId);
            showAlert('info', 'Switching to new playlist. Stay focused on your studies!', 5000);
        } else {
            showAlert(
                'info', 
                'Returning to previous playlist...', 
                3000, 
                {
                    text: 'Return Now',
                    callback: returnToStudyPlaylist
                }
            );
        }
    }

    // Continue monitoring
    setTimeout(monitorNavigation, 1000);
}


// Add this to your message listener in content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // ... your existing code ...

    if (request.action === 'updateBreakSettings') {
        const settings = request.settings;
        
        // Update break interval
        if (settings.breakInterval === 'custom') {
            breakInterval = settings.customInterval * 60 * 1000;
        } else {
            breakInterval = parseInt(settings.breakInterval) * 60 * 1000;
        }

        // Update break duration
        if (settings.breakDuration === 'custom') {
            breakDuration = settings.customDuration * 60 * 1000;
        } else {
            breakDuration = parseInt(settings.breakDuration) * 60 * 1000;
        }

        // Show confirmation
        showAlert('info', 'Break settings updated!', 3000);
        
        // Reset break timer if monitoring is active
        if (isMonitoring) {
            lastBreakTime = Date.now();
        }
    }
});

// Update the suggestBreak function to show interval
function suggestBreak() {
    if (isOnBreak) return;

    const studyDuration = Date.now() - studyStartTime;
    const intervalMinutes = breakInterval / (60 * 1000);
    const breakMinutes = breakDuration / (60 * 1000);
    
    showAlert(
        'info',
        `You've been studying for ${formatDuration(studyDuration)}. Time for a ${breakMinutes}-minute break!`,
        0,
        {
            text: `Take ${breakMinutes}min Break`,
            callback: startBreak
        }
    );
    playBeep();
}
console.log('Study Assistant content script loaded');