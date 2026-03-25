class ChatBot {
    constructor() {
        this.currentStep = 1;
        this.history = [];
        this.sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        this.currentTaskDescription = ""; // Empty until server provides actual task
        this.chatBox = document.getElementById('chat-box');
        this.userInput = document.getElementById('user-input');
        this.chatForm = document.getElementById('chat-form');
        this.stepHint = document.getElementById('step-hint');
        this.typingIndicator = document.getElementById('typing-indicator');
        this.userTypingIndicator = document.getElementById('user-typing-indicator');
        this.hasSentFirstMessage = false;
        this.lastKnownStep = 1;
        this.pollInterval = null;
        
        this.init();
    }
    
    init() {
        this.chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage();
        });
        
        // Show user typing indicator when user types
        this.userInput.addEventListener('input', () => {
            if (this.userInput.value.trim() !== '') {
                this.showUserTypingIndicator();
            } else {
                this.hideUserTypingIndicator();
            }
        });
        
        // Display initial task hint immediately
        this.currentTaskDescription = "Say hello or greet Bob";
        this.displayStepHint();
        this.addBotMessage("Hey... what do you want?");
        
        // Fetch initial task description
        this.fetchInitialTask();
        
        // Fetch initial task description
        this.fetchInitialTask();
        
        // Start polling for live updates
        this.startPolling();
    }
    
    startPolling() {
        // Poll every 2 seconds for session updates
        this.pollInterval = setInterval(() => {
            this.checkForUpdates();
        }, 2000);
    }
    
    async checkForUpdates() {
        try {
            const response = await fetch(`/api/session/${this.sessionId}`);
            if (response.ok) {
                const data = await response.json();
                
                // Check if step has changed
                if (data.step !== this.lastKnownStep) {
                    console.log(`[POLL] Step changed from ${this.lastKnownStep} to ${data.step}`);
                    this.lastKnownStep = data.step;
                    this.currentStep = data.step;
                    
                    // Update task description if available
                    if (data.currentTask && data.currentTask.description) {
                        this.currentTaskDescription = data.currentTask.description;
                        this.displayStepHint();
                    }
                    
                    // If we reached step 5, redirect to evaluation
                    if (data.step === 5) {
                      setTimeout(() => {
                        window.location.href = '/evaluation';
                      }, 1500);
                    }
                }
            }
        } catch (error) {
            // Silently fail - polling is just for updates, not critical
            console.log('[POLL] Error checking for updates:', error);
        }
    }
    
    sendMessage() {
        const message = this.userInput.value.trim();
        if (message === '') return;
        
        this.addUserMessage(message);
        this.userInput.value = '';
        this.userInput.disabled = true;
        this.hideUserTypingIndicator();
        
        // Show typing indicator for all messages
        this.showTypingIndicator();
        
        // Simulate thinking delay
        setTimeout(() => {
            this.getBotResponse(message);
        }, 500 + Math.random() * 1000); // Random delay for more natural feel
    }
    
    async getBotResponse(userMessage) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: userMessage,
                    step: this.currentStep,
                    sessionId: this.sessionId
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Check if AI was detected
            if (data.aiDetected) {
                this.hideTypingIndicator();
                this.addBotMessage(data.response);
                setTimeout(() => {
                    window.location.href = '/failure';
                }, 1500);
                return;
            }
            
            this.history = [...this.history, {role: 'user', content: userMessage}, {role: 'assistant', content: data.response}];
            
            // Hide typing indicator before adding the message
            this.hideTypingIndicator();
            
            // Add task completion message if present (separate from Bob's response)
            if (data.taskCompletion) {
                setTimeout(() => {
                    this.addSystemMessage(data.taskCompletion);
                }, 100);
            }
            
            // Add bot message with a slight delay for natural feel
            setTimeout(() => {
                this.addBotMessage(data.response);
            }, 300);
            
            if (data.step !== undefined) {
                this.currentStep = data.step;
                
                // Update task description from server response
                if (data.currentTask && data.currentTask.description) {
                    this.currentTaskDescription = data.currentTask.description;
                }
                
                this.displayStepHint();
                
                // Redirect to evaluation page when step 5 is reached
                if (this.currentStep === 5) {
                  setTimeout(() => {
                    window.location.href = '/evaluation';
                  }, 1500);
                  return;
                }
            }
            
            if (data.complete) {
                setTimeout(() => {
                    window.location.href = '/success';
                }, 1500);
            }
            
            // Mark that first message has been sent
            this.hasSentFirstMessage = true;
            
            this.userInput.disabled = false;
            this.userInput.focus();
        } catch (error) {
            console.error('Error:', error);
            this.hideTypingIndicator();
            this.addBotMessage("Sorry, something went wrong. Please try again.");
            this.userInput.disabled = false;
            this.userInput.focus();
        }
    }
    
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
    
    addUserMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user-message';
        messageDiv.textContent = message;
        this.chatBox.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    cleanBotResponse(message) {
        // Remove action descriptions like *blushes and glitches slightly*
        // This regex matches text between asterisks (including the asterisks)
        return message.replace(/\*[^*]+\*/g, '').trim();
    }
    
    addBotMessage(message) {
        const cleanedMessage = this.cleanBotResponse(message);
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message';
        messageDiv.textContent = cleanedMessage;
        this.chatBox.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    addSystemMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system-message';
        messageDiv.textContent = message;
        this.chatBox.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    showTypingIndicator() {
        this.typingIndicator.style.display = 'flex';
        this.scrollToBottom();
    }
    
    hideTypingIndicator() {
        this.typingIndicator.style.display = 'none';
    }
    
    showUserTypingIndicator() {
        this.userTypingIndicator.style.display = 'flex';
        this.scrollToBottom();
    }
    
    hideUserTypingIndicator() {
        this.userTypingIndicator.style.display = 'none';
    }
    
    displayStepHint() {
        // Only display if we have a task description from the server
        if (this.currentTaskDescription) {
            this.stepHint.textContent = this.currentTaskDescription;
            this.stepHint.style.display = 'flex';
        } else {
            // Hide the hint until we get the actual task
            this.stepHint.style.display = 'none';
        }
    }
    
    async fetchInitialTask() {
        try {
            const response = await fetch(`/api/session/${this.sessionId}`);
            if (response.ok) {
                const data = await response.json();
                
                // Update task description if available
                if (data.currentTask && data.currentTask.description) {
                    this.currentTaskDescription = data.currentTask.description;
                    this.displayStepHint();
                }
            }
        } catch (error) {
            // Silently fail - polling will handle updates
            console.log('[INIT] Error fetching initial task:', error);
        }
    }
    
    scrollToBottom() {
        this.chatBox.scrollTop = this.chatBox.scrollHeight;
    }
}

// Initialize chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.chatBot = new ChatBot();
});