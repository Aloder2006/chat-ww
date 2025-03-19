import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    push, 
    onValue, 
    remove,
    serverTimestamp,
    onDisconnect,
    set,
    update,
    get
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyDNqT3UnMd2lNMtAAfeM6_v6s9hUo_98UY",
    authDomain: "public-chat-35716.firebaseapp.com",
    databaseURL: "https://public-chat-35716-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "public-chat-35716",
    storageBucket: "public-chat-35716.firebasestorage.app",
    messagingSenderId: "725044153716",
    appId: "1:725044153716:web:172b30d7d7df1e48d4b021",
    measurementId: "G-ZHRM9H6WV6"
  };

class FirebaseManager {
    constructor(config) {
        this.app = initializeApp(config);
        this.db = getDatabase(this.app);
        this.refs = this.initializeRefs();
    }

    initializeRefs() {
        return {
            messages: ref(this.db, 'messages'),
            connected: ref(this.db, '.info/connected'),
            typing: ref(this.db, 'typing'),
            seen: ref(this.db, 'seen'),
            users: ref(this.db, 'users')
        };
    }

    async saveUser(username, deviceId) {
        const userRef = ref(this.db, `users/${username}`);
        await set(userRef, {
            username,
            deviceId,
            lastSeen: serverTimestamp(),
            status: true,
            createdAt: serverTimestamp(),
            devices: {
                [deviceId]: true
            }
        });
    }

    async getExistingUserByDevice(deviceId) {
        const snapshot = await get(this.refs.users);
        let foundUser = null;
        
        snapshot.forEach(childSnapshot => {
            const userData = childSnapshot.val();
            if (userData.devices && userData.devices[deviceId]) {
                foundUser = { username: childSnapshot.key, ...userData };
            }
        });
        
        return foundUser;
    }

    async deleteUser(username) {
        try {
            await remove(ref(this.db, `users/${username}`));
            await remove(ref(this.db, `typing/${username}`));
        } catch (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    }
}

// Add after FirebaseManager class
class DeviceManager {
    static generateDeviceId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const timestamp = new Date().getTime().toString(36);
        const randomChars = Array.from({ length: 10 }, () => 
            chars.charAt(Math.floor(Math.random() * chars.length))).join('');
        return `device_${timestamp}_${randomChars}`;
    }

    static getDeviceId() {
        let deviceId = localStorage.getItem('deviceId');
        if (!deviceId) {
            deviceId = this.generateDeviceId();
            localStorage.setItem('deviceId', deviceId);
        }
        return deviceId;
    }
}

// Move ChatUI class definition to the top of the file after imports and firebaseConfig
class ChatUI {
    constructor() {
        this.elements = this.initializeElements();
        if (!this.validateElements()) {
            console.error('Some required elements are missing from the DOM');
            return;
        }
        this.bindEvents();
    }

    validateElements() {
        const requiredElements = [
            'messages',
            'messageInput',
            'sendButton',
            'loginContainer',
            'chatContainer',
            'userNameInput',
            'loginButton',
            'logoutButton',
            'userDisplay'
        ];

        return requiredElements.every(elementName => {
            if (!this.elements[elementName]) {
                console.error(`Required element "${elementName}" is missing`);
                return false;
            }
            return true;
        });
    }

    initializeElements() {
        return {
            messages: document.querySelector('.messages'),
            messageInput: document.getElementById('message-input'),
            sendButton: document.getElementById('send-button'),
            loginContainer: document.querySelector('.login-container'),
            chatContainer: document.querySelector('.chat-container'),
            userNameInput: document.getElementById('username-input'),
            loginButton: document.getElementById('login-button'),
            userDisplay: document.getElementById('user-display'),
            logoutButton: document.getElementById('logout-button'),
            searchInput: document.querySelector('.search-input'),
            statusDisplay: document.querySelector('.connection-status'),
            userList: document.querySelector('.user-list'),
            charCounter: document.querySelector('.char-counter'),
            typingIndicator: document.querySelector('.typing-indicator'),
            chatHeader: document.querySelector('.chat-header'),
            headerActions: document.querySelector('.header-actions')
        };
    }

    bindEvents() {
        this.elements.messageInput?.addEventListener('input', this.handleMessageInput.bind(this));
        this.elements.searchInput?.addEventListener('input', this.handleSearch.bind(this));
        this.elements.sendButton?.addEventListener('click', this.handleSend.bind(this));
        this.elements.logoutButton?.addEventListener('click', this.handleLogout.bind(this));
    }

    handleMessageInput(e) {
        const remaining = MAX_MESSAGE_LENGTH - e.target.value.length;
        if (this.elements.charCounter) {
            this.elements.charCounter.textContent = `${remaining} حرف متبقي`;
            this.elements.charCounter.style.color = remaining < 50 ? '#dc3545' : '#6c757d';
        }
    }

    handleSearch(e) {
        const searchTerm = e.target.value.toLowerCase();
        const messages = this.elements.messages?.querySelectorAll('.message');
        messages?.forEach(message => {
            const text = message.querySelector('.message-content')?.textContent.toLowerCase();
            message.style.display = text?.includes(searchTerm) ? 'flex' : 'none';
        });
    }

    handleSend() {
        // Implementation will be added when integrating with Firebase
    }

    handleLogout() {
        // Implementation will be added when integrating with Firebase
    }
}

// Initialize Firebase and the chat UI
const firebaseManager = new FirebaseManager(firebaseConfig);
const chatUI = new ChatUI();

// Initialize references
const db = firebaseManager.db;
const messagesRef = firebaseManager.refs.messages;
const connectedRef = firebaseManager.refs.connected;
const typingRef = firebaseManager.refs.typing;
const seenRef = firebaseManager.refs.seen;
const usersRef = firebaseManager.refs.users;

// Constants
const MAX_USERNAME_LENGTH = 20;
const MIN_USERNAME_LENGTH = 3;
const MAX_MESSAGE_LENGTH = 500;

// Initialize ChatUI

// Add user management functions
async function checkExistingUser(username) {
    const userRef = ref(db, `users/${username}`);
    const snapshot = await get(userRef);
    return snapshot.exists();
}

// Modify the initializeUser function
async function initializeUser() {
    try {
        const deviceId = DeviceManager.getDeviceId();
        const existingUser = await firebaseManager.getExistingUserByDevice(deviceId);
        
        if (existingUser) {
            currentUser = existingUser.username;
            chatUI.elements.loginContainer.style.display = 'none';
            chatUI.elements.chatContainer.style.display = 'block';
            chatUI.elements.userDisplay.textContent = `مرحباً ${existingUser.username}`;
            
            const userRef = ref(db, `users/${existingUser.username}`);
            await update(userRef, {
                status: true,
                lastSeen: serverTimestamp()
            });
            
            onDisconnect(userRef).update({
                status: false,
                lastSeen: serverTimestamp()
            });
            
            loadMessages();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error initializing user:', error);
        return false;
    }
}

let currentUser = '';
let isOnline = true;
chatUI.elements.statusDisplay.className = 'connection-status';
chatUI.elements.chatContainer.insertBefore(chatUI.elements.statusDisplay, chatUI.elements.messages);

// Replace the existing login button event listener
chatUI.elements.loginButton.addEventListener('click', async () => {
    const username = chatUI.elements.userNameInput.value.trim();
    
    // Validate username length
    if (username.length < MIN_USERNAME_LENGTH) {
        alert(`يجب أن يحتوي اسم المستخدم على ${MIN_USERNAME_LENGTH} أحرف على الأقل`);
        return;
    }
    if (username.length > MAX_USERNAME_LENGTH) {
        alert(`يجب أن يكون اسم المستخدم أقل من ${MAX_USERNAME_LENGTH} حرفاً`);
        return;
    }
    
    if (username) {
        try {
            // Check if username is taken by an active user
            const existingUser = await checkExistingUser(username);
            if (existingUser) {
                alert('هذا الاسم مستخدم بالفعل. الرجاء اختيار اسم آخر.');
                return;
            }

            const deviceId = DeviceManager.getDeviceId();
            await firebaseManager.saveUser(username, deviceId);
            
            currentUser = username;
            chatUI.elements.loginContainer.style.display = 'none';
            chatUI.elements.chatContainer.style.display = 'block';
            chatUI.elements.userDisplay.textContent = `مرحباً ${username}`;
            
            // Set up disconnect handler
            const userRef = ref(db, `users/${username}`);
            onDisconnect(userRef).update({
                status: false,
                lastSeen: serverTimestamp()
            });
            
            loadMessages();
        } catch (error) {
            console.error('Login error:', error);
            alert('حدث خطأ أثناء تسجيل الدخول. الرجاء المحاولة مرة أخرى.');
        }
    }
});

// Add connection state listener
onValue(connectedRef, (snapshot) => {
    isOnline = snapshot.val() === true;
    updateConnectionStatus(isOnline);
    
    if (isOnline && currentUser) {
        // Set user's online status
        const userStatusRef = ref(db, `users/${currentUser}/status`);
        set(userStatusRef, true);
        
        // Remove the status when user disconnects
        onDisconnect(userStatusRef).remove();
    }
}, (error) => {
    console.error("Connection state listener error:", error);
    isOnline = false;
    updateConnectionStatus(false);
});

// Load messages
function loadMessages() {
    onValue(messagesRef, (snapshot) => {
        chatUI.elements.messages.innerHTML = '';
        snapshot.forEach(childSnapshot => {
            const message = childSnapshot.val();
            const messageElement = createMessageElement(message, childSnapshot.key, true);
            chatUI.elements.messages.appendChild(messageElement);
        });
        scrollToBottom();
    }, (error) => {
        console.error("Error loading messages:", error);
        isOnline = false;
        updateConnectionStatus(false);
    });
}

// Create message element
function createMessageElement(message, messageId, isServer) {
    const div = document.createElement('div');
    div.className = `message ${message.user === currentUser ? 'my-message' : 'sender'}`;
    if (!isServer) {
        div.className += ' pending';
    }
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = message.text;
    
    const info = document.createElement('div');
    info.className = 'message-info';
    const timestamp = message.timestamp ? new Date(message.timestamp) : new Date();
    info.textContent = `${message.user} - ${timestamp.toLocaleTimeString('ar-SA')}`;
    
    div.appendChild(info);
    div.appendChild(content);
    
    // Create actions container
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    
    if (message.user === currentUser) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-link text-danger p-0 mx-1';
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteBtn.onclick = () => deleteMessage(messageId);
        
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-link text-primary p-0 mx-1';
        editBtn.innerHTML = '<i class="fas fa-edit"></i>';
        editBtn.onclick = () => editMessage(messageId, content);
        
        actions.appendChild(deleteBtn);
        actions.appendChild(editBtn);
        div.appendChild(actions);
    }
    
    // Add reactions with counts
    const reactions = document.createElement('div');
    reactions.className = 'message-reactions';
    const reactionTypes = ['👍', '❤️', '😄', '😮', '😢', '😠'];
    
    reactionTypes.forEach(type => {
        const reactionWrapper = document.createElement('div');
        reactionWrapper.className = 'reaction-wrapper';
        
        const button = document.createElement('button');
        button.className = `reaction-btn ${message.reactions && message.reactions[currentUser] === type ? 'active' : ''}`;
        button.textContent = type;
        button.onclick = () => addReaction(messageId, type);
        
        const count = document.createElement('span');
        count.className = 'reaction-count';
        const reactionCount = message.reactions ? 
            Object.values(message.reactions).filter(r => r === type).length : 0;
        if (reactionCount > 0) {
            count.textContent = reactionCount;
            reactionWrapper.classList.add('has-reactions');
        }
        
        reactionWrapper.appendChild(button);
        reactionWrapper.appendChild(count);
        reactions.appendChild(reactionWrapper);
    });
    
    div.appendChild(reactions);
    
    return div;
}

// Add new edit message function
async function editMessage(messageId, contentElement) {
    const oldText = contentElement.textContent;
    const newText = prompt('تعديل الرسالة:', oldText);
    
    if (newText && newText !== oldText) {
        try {
            await update(ref(db, `messages/${messageId}`), {
                text: newText,
                edited: true,
                editedAt: serverTimestamp()
            });
        } catch (error) {
            console.error('Error editing message:', error);
            alert('حدث خطأ في تعديل الرسالة');
        }
    }
}

// Update the addReaction function to handle toggling
async function addReaction(messageId, reaction) {
    if (!currentUser) return;
    
    try {
        const messageRef = ref(db, `messages/${messageId}`);
        const reactionRef = ref(db, `messages/${messageId}/reactions/${currentUser}`);
        const snapshot = await get(reactionRef);
        
        if (snapshot.exists() && snapshot.val() === reaction) {
            // Remove reaction if clicking the same one
            await remove(reactionRef);
        } else {
            // Add or change reaction
            await set(reactionRef, reaction);
        }
    } catch (error) {
        console.error('Error updating reaction:', error);
    }
}

// Send message
async function sendMessage() {
    const text = chatUI.elements.messageInput.value.trim();
    if (text) {
        try {
            if (text.length > MAX_MESSAGE_LENGTH) {
                alert(`يجب أن تكون الرسالة أقل من ${MAX_MESSAGE_LENGTH} حرف`);
                return;
            }
            if (!isOnline) {
                alert('أنت غير متصل حالياً. سيتم إرسال رسالتك عند عودة الاتصال.');
            }
            await push(messagesRef, {
                text,
                user: currentUser,
                timestamp: serverTimestamp()
            });
            chatUI.elements.messageInput.value = '';
        } catch (error) {
            console.error("Error sending message: ", error);
            alert('حدث خطأ في إرسال الرسالة. الرجاء المحاولة مرة أخرى.');
        }
    }
}

// Delete message
async function deleteMessage(messageId) {
    try {
        await remove(ref(db, `messages/${messageId}`));
    } catch (error) {
        console.error("Error deleting message: ", error);
    }
}

// Add this new function for connection status
function updateConnectionStatus(online) {
    isOnline = online;
    chatUI.elements.statusDisplay.textContent = online ? 
        '🟢 متصل' : 
        '🔴 غير متصل - سيتم المزامنة عند عودة الاتصال';
    chatUI.elements.statusDisplay.className = `connection-status ${online ? 'online' : 'offline'}`;
}

// Add after updateConnectionStatus function
function updateOnlineCount(snapshot) {
    let count = 0;
    snapshot.forEach(childSnapshot => {
        if (childSnapshot.val().status === true) {
            count++;
        }
    });
    chatUI.elements.userList.querySelector('.online-count').innerHTML = `<span class="count">${count}</span> مستخدم متصل`;
}

// Update the users listener
onValue(usersRef, (snapshot) => {
    let onlineUsers = [];
    snapshot.forEach(childSnapshot => {
        const userData = childSnapshot.val();
        if (userData.status) {
            onlineUsers.push(userData);
        }
    });
    
    // Update count
    const count = onlineUsers.length;
    chatUI.elements.userList.querySelector('.online-count').innerHTML = `
        <span class="count">${count}</span>
        ${count === 1 ? 'مستخدم متصل' : 'مستخدمين متصلين'}
    `;
    
    // Update list
    const listHTML = onlineUsers.map(user => `
        <div class="user-item">
            <span class="user-status online"></span>
            <span class="user-name">${user.username}</span>
            <span class="user-joined">منذ ${getTimeAgo(user.createdAt)}</span>
        </div>
    `).join('');
    
    chatUI.elements.userList.innerHTML = `
        <h3>المستخدمون المتصلون</h3>
        ${chatUI.elements.userList.querySelector('.online-count').outerHTML}
        ${listHTML}
    `;
});

// Add helper function for time
function getTimeAgo(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    const intervals = {
        سنة: 31536000,
        شهر: 2592000,
        يوم: 86400,
        ساعة: 3600,
        دقيقة: 60
    };
    
    for (let [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval === 1 ? '' : 'ات'}`;
        }
    }
    
    return 'الآن';
}

// Event listener
chatUI.elements.sendButton.addEventListener('click', sendMessage);
chatUI.elements.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Add input event listener for username input
chatUI.elements.userNameInput.addEventListener('input', () => {
    if (chatUI.elements.userNameInput.value.length > MAX_USERNAME_LENGTH) {
        chatUI.elements.userNameInput.value = chatUI.elements.userNameInput.value.slice(0, MAX_USERNAME_LENGTH);
    }
});

// Add after the existing event listeners
let typingTimeout;
chatUI.elements.messageInput.addEventListener('input', () => {
    if (currentUser) {
        // Update typing status
        const userTypingRef = ref(db, `typing/${currentUser}`);
        set(userTypingRef, true);
        
        // Clear previous timeout
        clearTimeout(typingTimeout);
        
        // Remove typing status after 2 seconds of no input
        typingTimeout = setTimeout(() => {
            remove(userTypingRef);
        }, 2000);
    }
});

// Add typing indicators container    
const typingIndicator = document.createElement('div');
typingIndicator.className = 'typing-indicator';
chatUI.elements.messages.after(typingIndicator);

// Listen for typing status changes
onValue(typingRef, (snapshot) => {
    const typingUsers = [];
    snapshot.forEach(child => {
        if (child.key !== currentUser && child.val()) {
            typingUsers.push(child.key);
        }
    });
    
    if (typingUsers.length > 0) {
        typingIndicator.textContent = `${typingUsers.join(', ')} يكتب...`;
        typingIndicator.style.display = 'block';
    } else {
        typingIndicator.style.display = 'none';
    }
});

// Update logout handler
chatUI.elements.logoutButton.addEventListener('click', async () => {
    try {
        if (currentUser) {
            // Delete user from all locations in the database
            await remove(ref(db, `users/${currentUser}`));
            await remove(ref(db, `typing/${currentUser}`));
            
            // Clear local data
            localStorage.removeItem('deviceId'); // Remove device ID to prevent auto-login
            currentUser = '';
            
            // Update UI
            chatUI.elements.chatContainer.style.display = 'none';
            chatUI.elements.loginContainer.style.display = 'block';
            chatUI.elements.messages.innerHTML = '';
            chatUI.elements.userNameInput.value = '';
            
            // Cancel any pending disconnect operations
            const userRef = ref(db, `users/${currentUser}`);
            await onDisconnect(userRef).cancel();
        }
    } catch (error) {
        console.error('Error logging out:', error);
        alert('حدث خطأ أثناء تسجيل الخروج. الرجاء المحاولة مرة أخرى.');
    }
});

// Call initializeUser when the page loads
window.addEventListener('load', async () => {
    chatUI.elements.chatContainer.style.display = 'none';
    if (!(await initializeUser())) {
        chatUI.elements.loginContainer.style.display = 'block';
    }
});

// Add after Firebase initialization
function cleanupOldMessages() {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    onValue(messagesRef, (snapshot) => {
        snapshot.forEach(childSnapshot => {
            const message = childSnapshot.val();
            if (message.timestamp && message.timestamp < oneDayAgo) {
                remove(ref(db, `messages/${childSnapshot.key}`));
            }
        });
    }, { onlyOnce: true });
}

// Add cleanup schedule
setInterval(cleanupOldMessages, 60 * 60 * 1000); // Check every hour
cleanupOldMessages(); // Initial cleanup

// Update the HTML structure
function updateHTMLStructure() {
    const container = document.querySelector('.container');
    const chatArea = document.createElement('div');
    chatArea.className = 'chat-area';
    
    // Move existing elements to chat-area
    while (container.firstChild) {
        chatArea.appendChild(container.firstChild);
    }
    
    // Add chat-area and user-list to container
    container.appendChild(chatArea);
    container.appendChild(chatUI.elements.userList);
}

// Call this function after DOM is loaded

// Initialize the chat application
async function initializeChatApp() {
    chatUI.elements.chatContainer.style.display = 'none';
    if (!(await initializeUser())) {
        chatUI.elements.loginContainer.style.display = 'block';
    }
}



// Add after ChatUI class initialization
function initializeThemeToggle() {
    const themeToggle = document.createElement('button');
    themeToggle.className = 'theme-toggle';
    themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    chatUI.elements.headerActions.appendChild(themeToggle);

    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeIcon(currentTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });
}

function updateThemeIcon(theme) {
    const themeToggle = document.querySelector('.theme-toggle i');
    themeToggle.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// Add after ChatUI class initialization
function initializeMobileFeatures() {
    const userList = chatUI.elements.userList;
    const onlineCount = userList.querySelector('.online-count');

    // Toggle user list expansion on mobile
    onlineCount?.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            userList.classList.toggle('expanded');
        }
    });

    // Close user list when clicking outside
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && 
            !userList.contains(e.target) && 
            userList.classList.contains('expanded')) {
            userList.classList.remove('expanded');
        }
    });

    // Handle keyboard appearance on mobile
    const messageInput = chatUI.elements.messageInput;
    messageInput?.addEventListener('focus', () => {
        if (window.innerWidth <= 768) {
            setTimeout(() => {
                window.scrollTo(0, document.body.scrollHeight);
                messageInput.scrollIntoView({ behavior: 'smooth' });
            }, 300);
        }
    });
}



document.addEventListener('DOMContentLoaded', () => {
    updateHTMLStructure();
    const chatUI = new ChatUI();
    const firebaseManager = new FirebaseManager(firebaseConfig);
    
    if (chatUI.elements.sendButton) {
        chatUI.elements.sendButton.addEventListener('click', sendMessage);
        chatUI.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
    
    initializeThemeToggle();
    initializeChatApp();
    initializeMobileFeatures();
});

// Add new function for smooth scrolling
function scrollToBottom() {
    const messages = chatUI.elements.messages;
    if (messages) {
        messages.scrollTo({
            top: messages.scrollHeight,
            behavior: 'smooth'
        });
    }
}