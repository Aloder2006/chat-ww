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

// Firebase configuration
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

// Constants
const MAX_USERNAME_LENGTH = 20;
const MIN_USERNAME_LENGTH = 3;
const MAX_MESSAGE_LENGTH = 500;
const MESSAGE_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * FirebaseManager - Handles all Firebase database operations
 */
class FirebaseManager {
    constructor(config) {
        this.app = initializeApp(config);
        this.db = getDatabase(this.app);
        this.refs = this.initializeRefs();
        this.setupListeners();
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
    
    setupListeners() {
        // Setup periodic cleanup of old messages
        setInterval(() => this.cleanupOldMessages(), 60 * 60 * 1000); // Every hour
        this.cleanupOldMessages(); // Initial cleanup
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
        
        // Setup disconnect handler
        onDisconnect(userRef).update({
            status: false,
            lastSeen: serverTimestamp()
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

    async checkExistingUser(username) {
        const userRef = ref(this.db, `users/${username}`);
        const snapshot = await get(userRef);
        return snapshot.exists();
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
    
    async sendMessage(text, username) {
        if (!text || !username) return null;
        
        try {
            return await push(this.refs.messages, {
                text,
                user: username,
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error("Error sending message:", error);
            throw error;
        }
    }
    
    async deleteMessage(messageId) {
        try {
            await remove(ref(this.db, `messages/${messageId}`));
            return true;
        } catch (error) {
            console.error("Error deleting message:", error);
            return false;
        }
    }
    
    async editMessage(messageId, newText) {
        try {
            await update(ref(this.db, `messages/${messageId}`), {
                text: newText,
                edited: true,
                editedAt: serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error('Error editing message:', error);
            return false;
        }
    }
    
    async addReaction(messageId, username, reaction) {
        if (!username) return false;
        
        try {
            const reactionRef = ref(this.db, `messages/${messageId}/reactions/${username}`);
            const snapshot = await get(reactionRef);
            
            if (snapshot.exists() && snapshot.val() === reaction) {
                // Remove reaction if clicking the same one
                await remove(reactionRef);
            } else {
                // Add or change reaction
                await set(reactionRef, reaction);
            }
            return true;
        } catch (error) {
            console.error('Error updating reaction:', error);
            return false;
        }
    }
    
    updateTypingStatus(username, isTyping) {
        if (!username) return;
        
        const userTypingRef = ref(this.db, `typing/${username}`);
        if (isTyping) {
            set(userTypingRef, true);
        } else {
            remove(userTypingRef);
        }
    }
    
    cleanupOldMessages() {
        const oneDayAgo = Date.now() - MESSAGE_CLEANUP_INTERVAL;
        
        onValue(this.refs.messages, (snapshot) => {
            snapshot.forEach(childSnapshot => {
                const message = childSnapshot.val();
                if (message.timestamp && message.timestamp < oneDayAgo) {
                    remove(ref(this.db, `messages/${childSnapshot.key}`));
                }
            });
        }, { onlyOnce: true });
    }
    
    cancelDisconnect(username) {
        if (!username) return;
        const userRef = ref(this.db, `users/${username}`);
        onDisconnect(userRef).cancel();
    }
}

/**
 * DeviceManager - Handles device identification and storage
 */
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
    
    static clearDeviceId() {
        localStorage.removeItem('deviceId');
    }
}

/**
 * ThemeManager - Handles theme switching functionality
 */
class ThemeManager {
    constructor() {
        this.prefersDarkTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.initTheme();
        this.setupListeners();
    }
    
    initTheme() {
        const savedTheme = localStorage.getItem('theme');
        const theme = savedTheme || (this.prefersDarkTheme ? 'dark' : 'light');
        this.setTheme(theme);
    }
    
    setupListeners() {
        // Listen for OS theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', e => {
                if (!localStorage.getItem('theme')) { // Only auto-switch if user hasn't manually set
                    this.setTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    }
    
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        // Update theme toggle icon if it exists
        const themeToggle = document.querySelector('.theme-toggle i');
        if (themeToggle) {
            themeToggle.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }
}

/**
 * ChatUI - Handles all UI-related operations
 */
class ChatUI {
    constructor(firebaseManager) {
        this.firebaseManager = firebaseManager;
        this.elements = this.initializeElements();
        this.themeManager = new ThemeManager();
        this.currentUser = '';
        this.isOnline = true;
        this.typingTimeout = null;
        
        if (!this.validateElements()) {
            console.error('Some required elements are missing from the DOM');
            return;
        }
        
        this.bindEvents();
        this.initializeUI();
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
            headerActions: document.querySelector('.header-actions'),
            onlineCount: document.querySelector('.online-count') || document.createElement('div')
        };
    }
    
    initializeUI() {
        // Initialize connection status display
        this.elements.statusDisplay.className = 'connection-status';
        
        // Make sure online count exists
        if (!this.elements.onlineCount.parentNode) {
            this.elements.onlineCount.className = 'online-count';
            this.elements.userList.prepend(this.elements.onlineCount);
        }
        
        // Set initial UI state
        this.elements.chatContainer.style.display = 'none';
        
        // Add theme toggle button
        this.initializeThemeToggle();
        
        // Initialize mobile-specific features
        this.initializeMobileFeatures();
    }

    bindEvents() {
        // Input handling
        this.elements.messageInput?.addEventListener('input', this.handleMessageInput.bind(this));
        this.elements.messageInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
        
        // Username input handling
        this.elements.userNameInput?.addEventListener('input', () => {
            if (this.elements.userNameInput.value.length > MAX_USERNAME_LENGTH) {
                this.elements.userNameInput.value = this.elements.userNameInput.value.slice(0, MAX_USERNAME_LENGTH);
            }
        });
        
        // Buttons
        this.elements.searchInput?.addEventListener('input', this.handleSearch.bind(this));
        this.elements.sendButton?.addEventListener('click', this.sendMessage.bind(this));
        this.elements.logoutButton?.addEventListener('click', this.handleLogout.bind(this));
        this.elements.loginButton?.addEventListener('click', this.handleLogin.bind(this));
    }
    
    initializeThemeToggle() {
        const themeToggle = document.createElement('button');
        themeToggle.className = 'theme-toggle';
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        this.elements.headerActions.appendChild(themeToggle);
        
        themeToggle.addEventListener('click', () => {
            this.themeManager.toggleTheme();
        });
    }
    
    initializeMobileFeatures() {
        const userList = this.elements.userList;
        const onlineCount = this.elements.onlineCount;

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
        const messageInput = this.elements.messageInput;
        messageInput?.addEventListener('focus', () => {
            if (window.innerWidth <= 768) {
                setTimeout(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                    messageInput.scrollIntoView({ behavior: 'smooth' });
                }, 300);
            }
        });
    }

    handleMessageInput(e) {
        const remaining = MAX_MESSAGE_LENGTH - e.target.value.length;
        
        // Update character counter
        if (this.elements.charCounter) {
            this.elements.charCounter.textContent = `${remaining} حرف متبقي`;
            this.elements.charCounter.style.color = remaining < 50 ? '#dc3545' : '#6c757d';
        }
        
        // Update typing status
        if (this.currentUser) {
            // Notify others that user is typing
            this.firebaseManager.updateTypingStatus(this.currentUser, true);
            
            // Clear previous timeout
            clearTimeout(this.typingTimeout);
            
            // Remove typing status after 2 seconds of no input
            this.typingTimeout = setTimeout(() => {
                this.firebaseManager.updateTypingStatus(this.currentUser, false);
            }, 2000);
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

    async sendMessage() {
        if (!this.currentUser) return;
        
        const text = this.elements.messageInput.value.trim();
        if (!text) return;
        
        try {
            if (text.length > MAX_MESSAGE_LENGTH) {
                alert(`يجب أن تكون الرسالة أقل من ${MAX_MESSAGE_LENGTH} حرف`);
                return;
            }
            
            if (!this.isOnline) {
                alert('أنت غير متصل حالياً. سيتم إرسال رسالتك عند عودة الاتصال.');
            }
            
            // Create temporary UI message while waiting for server response
            const tempMsg = {
                text,
                user: this.currentUser,
                timestamp: Date.now()
            };
            const tempElement = this.createMessageElement(tempMsg, 'temp', false);
            this.elements.messages.appendChild(tempElement);
            this.scrollToBottom();
            
            // Clear input
            this.elements.messageInput.value = '';
            this.elements.messageInput.focus();
            
            // Send to Firebase
            await this.firebaseManager.sendMessage(text, this.currentUser);
            
            // Remove typing status
            this.firebaseManager.updateTypingStatus(this.currentUser, false);
        } catch (error) {
            console.error("Error sending message: ", error);
            alert('حدث خطأ في إرسال الرسالة. الرجاء المحاولة مرة أخرى.');
        }
    }

    async handleLogin() {
        const username = this.elements.userNameInput.value.trim();
        
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
                const existingUser = await this.firebaseManager.checkExistingUser(username);
                if (existingUser) {
                    alert('هذا الاسم مستخدم بالفعل. الرجاء اختيار اسم آخر.');
                    return;
                }

                const deviceId = DeviceManager.getDeviceId();
                await this.firebaseManager.saveUser(username, deviceId);
                
                // Set current user and update UI
                this.currentUser = username;
                this.elements.loginContainer.style.display = 'none';
                this.elements.chatContainer.style.display = 'flex';
                this.elements.userDisplay.textContent = `مرحباً ${username}`;
                
                // Load messages
                this.loadMessages();
                
                // Setup typing listeners
                this.setupTypingListeners();
                
                // Setup user list listeners
                this.setupUserListeners();
            } catch (error) {
                console.error('Login error:', error);
                alert('حدث خطأ أثناء تسجيل الدخول. الرجاء المحاولة مرة أخرى.');
            }
        }
    }
    
    async handleLogout() {
        try {
            if (this.currentUser) {
                // Delete user from all locations in the database
                await this.firebaseManager.deleteUser(this.currentUser);
                
                // Cancel any pending disconnect operations
                this.firebaseManager.cancelDisconnect(this.currentUser);
                
                // Clear local data
                DeviceManager.clearDeviceId();
                this.currentUser = '';
                
                // Update UI
                this.elements.chatContainer.style.display = 'none';
                this.elements.loginContainer.style.display = 'block';
                this.elements.messages.innerHTML = '';
                this.elements.userNameInput.value = '';
            }
        } catch (error) {
            console.error('Error logging out:', error);
            alert('حدث خطأ أثناء تسجيل الخروج. الرجاء المحاولة مرة أخرى.');
        }
    }
    
    async loadMessages() {
        onValue(this.firebaseManager.refs.messages, (snapshot) => {
            this.elements.messages.innerHTML = '';
            snapshot.forEach(childSnapshot => {
                const message = childSnapshot.val();
                const messageElement = this.createMessageElement(message, childSnapshot.key, true);
                this.elements.messages.appendChild(messageElement);
            });
            this.scrollToBottom();
        }, (error) => {
            console.error("Error loading messages:", error);
            this.isOnline = false;
            this.updateConnectionStatus(false);
        });
    }
    
    setupTypingListeners() {
        onValue(this.firebaseManager.refs.typing, (snapshot) => {
            const typingUsers = [];
            snapshot.forEach(child => {
                if (child.key !== this.currentUser && child.val()) {
                    typingUsers.push(child.key);
                }
            });
            
            if (typingUsers.length > 0) {
                this.elements.typingIndicator.textContent = `${typingUsers.join(', ')} يكتب...`;
                this.elements.typingIndicator.style.display = 'block';
            } else {
                this.elements.typingIndicator.style.display = 'none';
            }
        });
    }
    
    setupUserListeners() {
        onValue(this.firebaseManager.refs.users, (snapshot) => {
            let onlineUsers = [];
            snapshot.forEach(childSnapshot => {
                const userData = childSnapshot.val();
                if (userData.status) {
                    onlineUsers.push(userData);
                }
            });
            
            // Update count
            const count = onlineUsers.length;
            this.elements.onlineCount.innerHTML = `
                <span class="count">${count}</span>
                ${count === 1 ? 'مستخدم متصل' : 'مستخدمين متصلين'}
            `;
            
            // Update list
            const usersContainer = this.elements.userList.querySelector('.users-container') || this.elements.userList;
            usersContainer.innerHTML = onlineUsers.map(user => `
                <div class="user-item">
                    <span class="user-status online"></span>
                    <span class="user-name">${user.username}</span>
                    <span class="user-joined">منذ ${this.getTimeAgo(user.createdAt)}</span>
                </div>
            `).join('');
        });
        
        // Connection state listener
        onValue(this.firebaseManager.refs.connected, (snapshot) => {
            this.isOnline = snapshot.val() === true;
            this.updateConnectionStatus(this.isOnline);
            
            if (this.isOnline && this.currentUser) {
                // Set user's online status
                const userStatusRef = ref(this.firebaseManager.db, `users/${this.currentUser}/status`);
                set(userStatusRef, true);
                
                // Remove the status when user disconnects
                onDisconnect(userStatusRef).set(false);
            }
        }, (error) => {
            console.error("Connection state listener error:", error);
            this.isOnline = false;
            this.updateConnectionStatus(false);
        });
    }
    
    createMessageElement(message, messageId, isServer) {
        const div = document.createElement('div');
        div.className = `message ${message.user === this.currentUser ? 'my-message' : 'sender'}`;
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
        
        if (message.edited) {
            const editedSpan = document.createElement('span');
            editedSpan.className = 'edited-indicator';
            editedSpan.textContent = ' (تم التعديل)';
            info.appendChild(editedSpan);
        }
        
        div.appendChild(info);
        div.appendChild(content);
        
        // Create actions container
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        
        if (message.user === this.currentUser) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-link text-danger p-0 mx-1';
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            deleteBtn.onclick = () => this.deleteMessage(messageId);
            
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-link text-primary p-0 mx-1';
            editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            editBtn.onclick = () => this.editMessage(messageId, content.textContent);
            
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
            button.className = `reaction-btn ${message.reactions && message.reactions[this.currentUser] === type ? 'active' : ''}`;
            button.textContent = type;
            button.onclick = () => this.addReaction(messageId, type);
            
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
    
    async addReaction(messageId, reaction) {
        await this.firebaseManager.addReaction(messageId, this.currentUser, reaction);
    }
    
    async deleteMessage(messageId) {
        if (confirm('هل أنت متأكد من حذف هذه الرسالة؟')) {
            await this.firebaseManager.deleteMessage(messageId);
        }
    }
    
    async editMessage(messageId, oldText) {
        const newText = prompt('تعديل الرسالة:', oldText);
        
        if (newText && newText !== oldText) {
            await this.firebaseManager.editMessage(messageId, newText);
        }
    }
    
    updateConnectionStatus(online) {
        this.isOnline = online;
        this.elements.statusDisplay.textContent = online ? 
            '🟢 متصل' : 
            '🔴 غير متصل - سيتم المزامنة عند عودة الاتصال';
        this.elements.statusDisplay.className = `connection-status ${online ? 'online' : 'offline'}`;
    }
    
    scrollToBottom() {
        const messages = this.elements.messages;
        if (messages) {
            messages.scrollTo({
                top: messages.scrollHeight,
                behavior: 'smooth'
            });
        }
    }
    
    getTimeAgo(timestamp) {
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
    
    async initializeUser() {
        try {
            const deviceId = DeviceManager.getDeviceId();
            const existingUser = await this.firebaseManager.getExistingUserByDevice(deviceId);
            
            if (existingUser) {
                this.currentUser = existingUser.username;
                this.elements.loginContainer.style.display = 'none';
                this.elements.chatContainer.style.display = 'flex';
                this.elements.userDisplay.textContent = `مرحباً ${existingUser.username}`;
                
                const userRef = ref(this.firebaseManager.db, `users/${existingUser.username}`);
                await update(userRef, {
                    status: true,
                    lastSeen: serverTimestamp()
                });
                
                onDisconnect(userRef).update({
                    status: false,
                    lastSeen: serverTimestamp()
                });
                
                this.loadMessages();
                this.setupTypingListeners();
                this.setupUserListeners();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error initializing user:', error);
            return false;
        }
    }
}

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener('DOMContentLoaded', async () => {
    const firebaseManager = new FirebaseManager(firebaseConfig);
    const chatUI = new ChatUI(firebaseManager);
    
    // Try to auto-login with device ID
    chatUI.elements.chatContainer.style.display = 'none';
    if (!(await chatUI.initializeUser())) {
        chatUI.elements.loginContainer.style.display = 'block';
    }
});