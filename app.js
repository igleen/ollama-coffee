// API Configuration
const API_BASE_URL = 'http://localhost:11434/api';
const APP_VERSION = '0.1';

// DOM Elements
const modelSelect = document.getElementById('model');
const promptInput = document.getElementById('prompt');
const sendButton = document.getElementById('send');
const messagesContainer = document.getElementById('messages');
const statusElement = document.getElementById('status');
const newChatButton = document.getElementById('newChat');
const deleteChatsButton = document.getElementById('deleteChats');
const chatList = document.getElementById('chatList');
const chatActionsBtn = document.getElementById('chatActionsBtn');
const chatActionsMenu = document.getElementById('chatActionsMenu');
const exportChatsBtn = document.getElementById('exportChats');
const importChatsBtn = document.getElementById('importChats');

// State
let currentModel = '';
let isGenerating = false;
let currentChatId = null;
let isRemoveMode = false;
let selectedChats = new Set();
let abortController = null;
let currentTheme = localStorage.getItem('theme') || 'coffee';

// Performance tracking
let currentMetrics = {
    totalDuration: 0,
    loadDuration: 0,
    promptEvalCount: 0,
    promptEvalDuration: 0,
    evalCount: 0,
    evalDuration: 0
};
let metricsUpdateInterval = null;

// Chat Management
const chatStorage = {
    saveChat(chatId, chatData) {
        const chats = this.getAllChats();
        chats[chatId] = chatData;
        localStorage.setItem('chats', JSON.stringify(chats));
    },

    getAllChats() {
        const chats = localStorage.getItem('chats');
        return chats ? JSON.parse(chats) : {};
    },

    getChat(chatId) {
        const chats = this.getAllChats();
        return chats[chatId] || null;
    },

    setActiveChat(chatId) {
        localStorage.setItem('activeChat', chatId);
        currentChatId = chatId;
    },

    getActiveChat() {
        return localStorage.getItem('activeChat');
    }
};

function createNewChat() {
    resetMetrics(); // Reset metrics for new chat
    const chatId = Date.now().toString();
    const chatData = {
        id: chatId,
        title: 'New Chat',
        messages: [],
        model: currentModel,
        lastUpdated: new Date().toISOString(),
        created: new Date().toISOString(),
        messageCount: 0 // Track total messages for sequence
    };
    
    chatStorage.saveChat(chatId, chatData);
    chatStorage.setActiveChat(chatId);
    loadChat(chatId);
    updateChatList();
}
function loadChat(chatId) {
    const chat = chatStorage.getChat(chatId);
    if (!chat) return;

    // Set currentChatId first to ensure it's available
    currentChatId = chatId;
    chatStorage.setActiveChat(chatId);

    messagesContainer.innerHTML = '';
    // Only load non-deleted messages
    chat.messages
        .filter(msg => !msg.deleted)
        .forEach(msg => {
            // Don't save to storage when loading existing messages
            appendMessage(msg.content, msg.type, false);
        });
    
    if (chat.model && modelSelect.querySelector(`option[value="${chat.model}"]`)) {
        modelSelect.value = chat.model;
        currentModel = chat.model;
    }
}

function updateChatList() {
    const chats = chatStorage.getAllChats();
    const activeChat = chatStorage.getActiveChat();
    
    chatList.innerHTML = '';
    
    Object.values(chats)
        .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated))
        .forEach(chat => {
            const chatElement = document.createElement('div');
            const classes = ['chat-item'];
            
            if (chat.id === activeChat && !isRemoveMode) {
                classes.push('active');
            }
            if (selectedChats.has(chat.id)) {
                classes.push('selected-for-removal');
            }
            
            chatElement.className = classes.join(' ');
            chatElement.dataset.chatId = chat.id;
            
            const lastMessage = chat.messages[chat.messages.length - 1];
            const preview = lastMessage ? lastMessage.content : 'New chat';
            
            chatElement.innerHTML = `
                <div class="chat-item-title">${chat.title}</div>
                <div class="chat-item-preview">${preview.substring(0, 60)}${preview.length > 60 ? '...' : ''}</div>
            `;
            
            chatElement.addEventListener('click', () => {
                if (isRemoveMode) {
                    toggleChatSelection(chat.id);
                } else {
                    chatStorage.setActiveChat(chat.id);
                    loadChat(chat.id);
                    updateChatList();
                }
            });
            
            chatList.appendChild(chatElement);
        });
}

function toggleRemoveMode() {
    isRemoveMode = !isRemoveMode;
    selectedChats.clear();
    deleteChatsButton.classList.toggle('active');
    updateChatList();
}

function toggleChatSelection(chatId) {
    if (selectedChats.has(chatId)) {
        selectedChats.delete(chatId);
    } else {
        selectedChats.add(chatId);
    }
    updateChatList();
}

function deleteSelectedChats() {
    if (selectedChats.size === 0) return;
    
    const chats = chatStorage.getAllChats();
    let needNewChat = false;
    
    selectedChats.forEach(chatId => {
        if (chatId === currentChatId) {
            needNewChat = true;
        }
        delete chats[chatId];
    });
    
    localStorage.setItem('chats', JSON.stringify(chats));
    selectedChats.clear();
    
    if (needNewChat || Object.keys(chats).length === 0) {
        createNewChat();
    } else if (!chats[currentChatId]) {
        // Load the most recent chat
        const mostRecent = Object.values(chats)
            .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated))[0];
        if (mostRecent) {
            chatStorage.setActiveChat(mostRecent.id);
            loadChat(mostRecent.id);
        }
    }
    
    isRemoveMode = false;
    deleteChatsButton.classList.remove('active');
    updateChatList();
}

// Initialize
async function init() {
    try {
        // Set version display
        const versionDisplay = document.querySelector('.version-display');
        if (versionDisplay) {
            versionDisplay.textContent = `v${APP_VERSION}`;
        }

        // Test API connection first
        try {
            await fetch(`${API_BASE_URL}/tags`);
        } catch (error) {
            if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
                const guidance = `
                    <div class="cors-error">
                        <h2>⚠️ Server Required</h2>
                        <p>This app needs to be served from a local web server to work properly.</p>
                        <div class="steps">
                            <p><strong>Why?</strong> Browser security prevents direct access to the Ollama API when opening the file directly.</p>
                            <p><strong>Solution:</strong></p>
                            <ol>
                                <li>Open your terminal</li>
                                <li>Navigate to the project folder</li>
                                <li>Run: <code>python3 -m http.server</code></li>
                                <li>Open: <a href="http://localhost:8000">http://localhost:8000</a></li>
                            </ol>
                        </div>
                    </div>`;
                messagesContainer.innerHTML = guidance;
                updateStatus('Server setup required');
                return;
            }
            throw error;  // Re-throw if it's not a CORS error
        }

        await loadModels();
        
        // Clean up old chats on startup
        cleanupOldChats();
        
        // Load existing chat or create new one
        const activeChat = chatStorage.getActiveChat();
        if (activeChat && chatStorage.getChat(activeChat)) {
            loadChat(activeChat);
            currentChatId = activeChat; // Explicitly set currentChatId
        } else {
            createNewChat();
        }
        
        // Setup event listeners after chat is loaded/created
        setupEventListeners();
        updateChatList();
        updateStatus('Ready');
        
        // Set up periodic cleanup
        setInterval(cleanupOldChats, 24 * 60 * 60 * 1000); // Run daily
    } catch (error) {
        updateStatus('Error connecting to Ollama API');
        console.error('Initialization error:', error);
    }
}

// Storage cleanup function
function cleanupOldChats() {
    const chats = chatStorage.getAllChats();
    const now = new Date();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    let hasChanges = false;
    
    Object.entries(chats).forEach(([chatId, chat]) => {
        const lastUpdated = new Date(chat.lastUpdated);
        if (now - lastUpdated > maxAge) {
            delete chats[chatId];
            hasChanges = true;
        }
    });
    
    if (hasChanges) {
        localStorage.setItem('chats', JSON.stringify(chats));
        updateChatList();
    }
}

// Load available models
async function loadModels() {
    try {
        const response = await fetch(`${API_BASE_URL}/tags`);
        const data = await response.json();
        
        modelSelect.innerHTML = data.models
            .map(model => `<option value="${model.name}">${model.name}</option>`)
            .join('');
        
        // Set initial model
        if (data.models.length > 0) {
            currentModel = data.models[0].name;
            modelSelect.value = currentModel;
        }
    } catch (error) {
        throw new Error('Failed to load models');
    }
}

// Event Listeners
// Export chat history
function exportChatHistory() {
    try {
        const chats = chatStorage.getAllChats();
        const exportData = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            chats: chats
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `chat-history-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        updateStatus('Chat history exported successfully');
    } catch (error) {
        updateStatus('Error exporting chat history');
        console.error('Export error:', error);
    }
}

// Import chat history
function importChatHistory(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            // Validate import data structure
            if (!importData.chats || typeof importData.chats !== 'object') {
                throw new Error('Invalid chat history format');
            }
            
            // Merge imported chats with existing chats
            const existingChats = chatStorage.getAllChats();
            const mergedChats = { ...existingChats };
            
            Object.entries(importData.chats).forEach(([chatId, chatData]) => {
                // Validate chat data structure
                if (!chatData.messages || !Array.isArray(chatData.messages)) {
                    throw new Error(`Invalid chat data for chat ID: ${chatId}`);
                }
                
                if (existingChats[chatId]) {
                    // For existing chats, append unique timestamp to ID
                    const newChatId = `${chatId}-${Date.now()}`;
                    mergedChats[newChatId] = chatData;
                    mergedChats[newChatId].id = newChatId;
                } else {
                    mergedChats[chatId] = chatData;
                }
            });
            
            // Save merged chats
            localStorage.setItem('chats', JSON.stringify(mergedChats));
            updateChatList();
            updateStatus('Chat history imported successfully');
        } catch (error) {
            updateStatus('Error importing chat history: Invalid format');
            console.error('Import error:', error);
        }
    };
    
    reader.onerror = function() {
        updateStatus('Error reading file');
        console.error('FileReader error:', reader.error);
    };
    
    reader.readAsText(file);
}

// Toggle dropdown menu
function toggleDropdown() {
    const isActive = chatActionsBtn.classList.toggle('active');
    chatActionsMenu.classList.toggle('show');
    
    // Close dropdown when clicking outside
    if (isActive) {
        const closeDropdown = (e) => {
            if (!chatActionsBtn.contains(e.target) && !chatActionsMenu.contains(e.target)) {
                chatActionsBtn.classList.remove('active');
                chatActionsMenu.classList.remove('show');
                document.removeEventListener('click', closeDropdown);
            }
        };
        // Add timeout to prevent immediate closure
        setTimeout(() => {
            document.addEventListener('click', closeDropdown);
        }, 0);
    }
}

function switchTheme() {
    const themes = ['light', 'coffee', 'dark'];
    const currentIndex = themes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    currentTheme = themes[nextIndex];
    
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    updateStatus(`Switched to ${currentTheme} theme`);
}

function setupEventListeners() {
    // Initialize theme
    document.documentElement.setAttribute('data-theme', currentTheme);
    modelSelect.addEventListener('change', (e) => {
        currentModel = e.target.value;
        resetMetrics(); // Reset metrics when model changes
        if (currentChatId) {
            const chat = chatStorage.getChat(currentChatId);
            if (chat) {
                chat.model = currentModel;
                chatStorage.saveChat(currentChatId, chat);
            }
        }
    });

    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    sendButton.addEventListener('click', handleSend);
    newChatButton.addEventListener('click', createNewChat);
    deleteChatsButton.addEventListener('click', () => {
        if (isRemoveMode && selectedChats.size > 0) {
            deleteSelectedChats();
        } else {
            toggleRemoveMode();
        }
    });

    // Chat actions dropdown
    chatActionsBtn.addEventListener('click', toggleDropdown);
    
    // Export button
    exportChatsBtn.addEventListener('click', exportChatHistory);
    
    // Import button
    importChatsBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        
        input.onchange = (e) => {
            if (e.target.files.length > 0) {
                importChatHistory(e.target.files[0]);
            }
        };
        
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
        
        // Close dropdown after selecting action
        chatActionsBtn.classList.remove('active');
        chatActionsMenu.classList.remove('show');
    });

    // Theme switcher
    document.getElementById('switchTheme').addEventListener('click', () => {
        switchTheme();
        // Close dropdown after selecting action
        chatActionsBtn.classList.remove('active');
        chatActionsMenu.classList.remove('show');
    });
}

// Handle sending messages
async function handleSend() {
    const prompt = promptInput.value.trim();
    
    if (isGenerating) {
        // Stop generation
        if (abortController) {
            abortController.abort();
            return;
        }
    }

    if (!currentModel || !currentChatId) return;
    
    const chat = chatStorage.getChat(currentChatId);
    if (!chat) return;

    isGenerating = true;
    sendButton.textContent = 'Stop';
    updateStatus('Generating response...');
    resetMetrics(); // Reset metrics before starting new generation

    try {
        let finalBotResponse = ''; // Variable to store the response from generateResponse
        if (!prompt) {
            // Handle empty prompt submission
            if (chat.messages.length > 0) {
                const lastMessage = chat.messages[chat.messages.length - 1];
                if (lastMessage.type === 'user') {
                    // Case 1: Last message was user - regenerate response
                    finalBotResponse = await generateResponse(lastMessage.content);
                } else {
                    // Case 2: Last message was assistant - continue conversation
                    finalBotResponse = await generateResponse('');
                }
            } else {
                // Empty chat - treat as Case 2
                finalBotResponse = await generateResponse('');
            }
        } else {
            // Normal message flow with non-empty prompt
            appendMessage(prompt, 'user'); // This still saves the user message
            promptInput.value = '';
            finalBotResponse = await generateResponse(prompt);
        }

        // Save the final bot response using the returned content
        if (finalBotResponse) { // Only save if we got a response
            const currentChat = chatStorage.getChat(currentChatId);
            if (currentChat) {
                const messageObj = {
                    type: 'bot',
                    content: finalBotResponse, // Use the returned content
                    timestamp: new Date().toISOString(),
                    conversation_id: currentChatId,
                    sequence: currentChat.messages.length, // Sequence is based on storage length *before* adding
                    edited: false,
                    context: currentChat.messages.map(m => m.content).join('\n') // Context before adding new msg
                };
                currentChat.messages.push(messageObj);
                currentChat.lastUpdated = new Date().toISOString(); // Update timestamp for bot response too
                chatStorage.saveChat(currentChatId, currentChat);
                updateChatList(); // Update list to reflect new timestamp
            }
        }
    } catch (error) {
        updateStatus('Error generating response');
        console.error('Generation error:', error);
    }

    isGenerating = false;
    sendButton.textContent = 'Send';
    abortController = null;
    updateStatus('Ready');
}

// Performance metrics display
function updateMetrics() {
    // Calculate tokens per second using official Ollama API metrics
    const speed = currentMetrics.evalCount > 0 ?
        (currentMetrics.evalCount / (currentMetrics.evalDuration * 1e-9)).toFixed(1) : 0;

    document.getElementById('totalDuration').textContent =
        `${(currentMetrics.totalDuration * 1e-9).toFixed(1)}s`;
    document.getElementById('generationSpeed').textContent = `${speed} t/s`;
    document.getElementById('tokenCount').textContent =
        `${currentMetrics.promptEvalCount + currentMetrics.evalCount}`;
}

function resetMetrics() {
    currentMetrics = {
        totalDuration: 0,
        loadDuration: 0,
        promptEvalCount: 0,
        promptEvalDuration: 0,
        evalCount: 0,
        evalDuration: 0
    };
    document.getElementById('totalDuration').textContent = '-';
    document.getElementById('generationSpeed').textContent = '-';
    document.getElementById('tokenCount').textContent = '-';
    if (metricsUpdateInterval) {
        clearInterval(metricsUpdateInterval);
        metricsUpdateInterval = null;
    }
}

// Generate response from Ollama
async function generateResponse(prompt) {
    let botResponse = ''; // Define botResponse at the top level of the function
    let botMessageElement = null; // To hold the reference to the new bot message div

    try {
        resetMetrics();
        metricsUpdateInterval = setInterval(updateMetrics, 100); // Update every 100ms

        // Get conversation history for context
        const chat = chatStorage.getChat(currentChatId);
        const conversationHistory = chat ? chat.messages.filter(msg => !msg.deleted) : [];

        // Format conversation history for the API
        let contextString = '';
        conversationHistory.forEach(msg => {
            if (msg.type === 'user') {
                contextString += `Human: ${msg.content}\n`;
            } else {
                contextString += `Assistant: ${msg.content}\n`;
            }
        });

        // Add current prompt and system instruction
        const systemPrompt = "You are a helpful assistant. Please respond to the following conversation:\n\n";
        contextString = systemPrompt + contextString;
        contextString += `Human: ${prompt}\nAssistant:`;

        // Create the new bot message element *before* fetching
        botMessageElement = appendMessage('', 'bot', false); // Create empty bot message, don't save yet

        abortController = new AbortController();
        const response = await fetch(`${API_BASE_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: currentModel,
                prompt: contextString,
                context: [], // Start with empty context on first message
                options: {
                    temperature: 0.7,
                    num_predict: 1024,
                }
            }),
            signal: abortController.signal
        });

        if (!response.ok) {
            // If the request fails, remove the placeholder message element
            if (botMessageElement) botMessageElement.remove();
            throw new Error('API request failed');
        }

        const reader = response.body.getReader();
        // botResponse is already defined above

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            // Decode and parse the chunk
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const data = JSON.parse(line);
                    if (data.done) {
                        // Update metrics with the final response data
                        currentMetrics = {
                            totalDuration: data.total_duration,
                            loadDuration: data.load_duration,
                            promptEvalCount: data.prompt_eval_count,
                            promptEvalDuration: data.prompt_eval_duration,
                            evalCount: data.eval_count,
                            evalDuration: data.eval_duration
                        };
                        updateMetrics();
                    }
                    // Clean response chunk of trailing spaces
                    const responseChunk = data.response.replace(/[\n\s]+$/, '');
                    botResponse += responseChunk;

                    // Update the specific bot message element
                    if (botMessageElement) {
                        const contentDiv = botMessageElement.querySelector('.message-content');
                        if (contentDiv) {
                            contentDiv.textContent = botResponse; // Update with cumulative content
                        }
                    }
                } catch (error) {
                    console.error('Error parsing chunk:', error);
                }
            }
        }
    } catch (error) {
        // Check if the error is from aborting
        if (error.name === 'AbortError') {
            updateStatus('Generation stopped');
        } else {
            // If an error occurs during streaming, remove the placeholder message element
            if (botMessageElement) botMessageElement.remove();
            throw new Error('Failed to generate response');
        }
    } finally {
        if (metricsUpdateInterval) {
            clearInterval(metricsUpdateInterval);
            metricsUpdateInterval = null;
        }
        // One final metrics update
        updateMetrics();
    }
    return botResponse; // Return the final accumulated response string
}

// UI Updates
function appendMessage(content, type, save = true) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;
    
    // Create content container and clean content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    // Clean content of trailing newlines and spaces
    contentDiv.textContent = content.replace(/[\n\s]+$/, '');
    messageDiv.appendChild(contentDiv);
    
    // Add sequence number as data attribute
    const chat = chatStorage.getChat(currentChatId);
    const sequence = chat ? chat.messages.length : 0;
    messageDiv.dataset.sequence = sequence.toString();
    
    // Add message controls
    const controls = document.createElement('div');
    controls.className = 'message-controls';
    controls.innerHTML = `
        <button class="message-control-btn copy-btn" title="Copy message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
        </button>
        <button class="message-control-btn edit-btn" title="Edit message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
        </button>
        <button class="message-control-btn delete-btn" title="Delete message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
        </button>
    `;
    messageDiv.appendChild(controls);
    
    // Add click handlers for edit and delete
    const copyBtn = controls.querySelector('.copy-btn');
    const editBtn = controls.querySelector('.edit-btn');
    const deleteBtn = controls.querySelector('.delete-btn');
    
    copyBtn.addEventListener('click', () => {
        const content = contentDiv.textContent;
        navigator.clipboard.writeText(content).then(() => {
            // Show brief visual feedback
            copyBtn.classList.add('copied');
            setTimeout(() => copyBtn.classList.remove('copied'), 1000);
        });
    });
    editBtn.addEventListener('click', () => handleEditMessage(messageDiv, type));
    deleteBtn.addEventListener('click', () => handleDeleteMessage(messageDiv, type));
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    if (save && currentChatId) {
        const chat = chatStorage.getChat(currentChatId);
        if (chat) {
            // Build conversation context from existing messages
            const existingMessages = chat.messages.filter(msg => !msg.deleted);
            let contextString = existingMessages.map(msg =>
                msg.type === 'user' ? `Human: ${msg.content}` : `Assistant: ${msg.content}`
            ).join('\n');
            
            const messageObj = {
                type,
                content,
                timestamp: new Date().toISOString(),
                conversation_id: currentChatId,
                sequence: chat.messages.length,
                edited: false,
                context: contextString // Store full conversation context
            };
            
            chat.messages.push(messageObj);
            
            // Only update lastUpdated and list position for user messages
            if (type === 'user') {
                chat.lastUpdated = new Date().toISOString();
                if (chat.messages.length === 1) {
                    chat.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
                }
                updateChatList();
            }
            
            chatStorage.saveChat(currentChatId, chat);
        }
    }
    return messageDiv; // Return the created message element
}

function handleEditMessage(messageDiv, type) {
    const contentDiv = messageDiv.querySelector('.message-content');
    const originalContent = contentDiv.textContent;
    
    // Create and configure textarea
    const textarea = document.createElement('textarea');
    textarea.value = originalContent;
    textarea.rows = 3;
    
    // Replace content with textarea
    messageDiv.classList.add('editing');
    contentDiv.innerHTML = '';
    contentDiv.appendChild(textarea);
    textarea.focus();
    
    // Handle save on Enter (without shift) and cancel on Escape
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveEdit(messageDiv, textarea.value, type);
        } else if (e.key === 'Escape') {
            cancelEdit(messageDiv, originalContent);
        }
    });
    
    // Handle blur
    textarea.addEventListener('blur', () => {
        saveEdit(messageDiv, textarea.value, type);
    });
}

function saveEdit(messageDiv, newContent, type) {
    if (!newContent.trim()) {
        // If content is empty, treat as cancel
        cancelEdit(messageDiv, messageDiv.querySelector('.message-content').textContent);
        return;
    }
    
    const contentDiv = messageDiv.querySelector('.message-content');
    contentDiv.textContent = newContent;
    messageDiv.classList.remove('editing');
    
    // Update in storage
    if (currentChatId) {
        const chat = chatStorage.getChat(currentChatId);
        if (chat) {
            const sequence = parseInt(messageDiv.dataset.sequence);
            const messageIndex = chat.messages.findIndex(m => m.sequence === sequence);
            
            if (messageIndex !== -1) {
                chat.messages[messageIndex].content = newContent;
                chat.messages[messageIndex].edited = true;
                chat.messages[messageIndex].editedAt = new Date().toISOString();
                chatStorage.saveChat(currentChatId, chat);
                
                // Update chat list if it's a user message that was used as the chat title
                if (type === 'user' && messageIndex === 0) {
                    chat.title = newContent.substring(0, 30) + (newContent.length > 30 ? '...' : '');
                    updateChatList();
                }
            }
        }
    }
}

function cancelEdit(messageDiv, originalContent) {
    const contentDiv = messageDiv.querySelector('.message-content');
    contentDiv.textContent = originalContent;
    messageDiv.classList.remove('editing');
}

function handleDeleteMessage(messageDiv, type) {
    const messageIndex = Array.from(messagesContainer.children).indexOf(messageDiv);
    
    if (currentChatId) {
        const chat = chatStorage.getChat(currentChatId);
        if (chat && messageIndex !== -1 && messageIndex < chat.messages.length) {
            chat.messages.splice(messageIndex, 1);
            chatStorage.saveChat(currentChatId, chat);
            
            // If we deleted the first user message, update the chat title
            if (type === 'user' && messageIndex === 0 && chat.messages.length > 0) {
                const nextUserMessage = chat.messages.find(m => m.type === 'user');
                if (nextUserMessage) {
                    chat.title = nextUserMessage.content.substring(0, 30) +
                        (nextUserMessage.content.length > 30 ? '...' : '');
                    chatStorage.saveChat(currentChatId, chat);
                    updateChatList();
                }
            }
        }
    }
    
    messageDiv.remove();
}

// Removed the old updateBotResponse function as it's replaced by inline logic in generateResponse

function updateStatus(message) {
    document.querySelector('.status-message').textContent = message;
}

// Initialize the application
init();
