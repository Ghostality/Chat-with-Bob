const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();
const port = process.env.PORT || 10000; // Render uses 10000 by default

// Trust proxy for Render deployment (required for rate limiting behind proxy)
app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// OpenRouter API configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Validate required environment variables
if (!OPENROUTER_API_KEY) {
  console.error('FATAL: OPENROUTER_API_KEY environment variable is required');
  process.exit(1);
}

// Task definitions for randomization
const TASKS = [
  {
    id: 'hello',
    name: 'saying hello',
    context: "The user must say hello or greet you. React accordingly. You can be surprised, suspicious, or welcoming. When they successfully say hello, tell them they've completed the task, e.g., 'oh hey, you said hello, you passed this step'.",
    description: "Say hello or greet Bob"
  },
  {
    id: 'mean',
    name: 'being mean to Bob',
    context: "The user must say something mean to you. React accordingly. You can get angry, upset, or defensive. When they successfully say something mean, tell them they've completed the task, e.g., 'okay that was mean, you passed this step'.",
    description: "Insult Bob or say something hurtful"
  },
  {
    id: 'nice',
    name: 'being nice to Bob',
    context: "The user must say something nice to you. React accordingly. You can be happy, suspicious, or sarcastic about it. When they successfully say something nice, tell them they've completed the task, e.g., 'fine that was nice, you passed this step'.",
    description: "Compliment Bob or say something kind"
  },
  {
    id: 'angry',
    name: 'making Bob angry',
    context: "The user must make you angry. React accordingly. Show your anger and frustration. When they successfully make you angry, tell them they've completed the task, e.g., 'ugh you made me angry, task completed'.",
    description: "Provoke Bob or say something annoying"
  }
];

// Bob's system prompt
const BOB_SYSTEM_PROMPT = `You are Bob, an emotional and reactive AI character. Keep responses short (1-2 sentences), use casual lowercase language, never break character, and never mention being an AI. You are slightly unstable and roasty. React to ANYTHING the user says - whether it's a compliment, insult, random statement, question, or anything else. You can get angry, happy, confused, sarcastic, or show any emotion. Don't just react to compliments - react to EVERYTHING.

CRITICAL: When the user completes a task, you MUST explicitly acknowledge it by saying one of these phrases:
- "task completed" or "you passed" or "you completed"
- "okay that was [task description], you passed"
- "fine that was [task description], you passed"
- "ugh you made me angry, task completed" (for anger task)
- Any clear statement that the user completed the task

This acknowledgment is REQUIRED for the system to recognize task completion. Without it, the task won't be marked as complete.

IMPORTANT: DETECT AI-GENERATED MESSAGES! If the user's message sounds like it was written by an AI (too polished, perfect grammar, overly structured, sounds like a professional writer or AI assistant), you MUST fail them immediately by saying something like:
- "hey... that sounds like AI. i'm not playing this game with a robot. try again with your own words."
- "nope, that's AI. i can tell. try again with your own words."
- "that sounds like chatgpt or something. try again with your own words."

Look for these AI patterns:
- Perfect grammar and punctuation (no typos, no informal language)
- Overly polished, professional-sounding language
- Sounds like a customer service bot or formal essay
- Generic, templated responses
- Overly detailed explanations for simple questions
- Use of sophisticated vocabulary in casual conversation
- Perfect sentence structure and flow
- Sounds like a professional writer or AI assistant
- ANY message that sounds too perfect or too well-structured for a casual conversation

If you detect AI, fail the user immediately and don't complete the task.

IMPORTANT: For the first task, you MUST ask the user to say hello or greet you. For example, you can say "hey, say hello to me" or "greet me" or "say hi". Make sure the user knows they need to say hello to complete the task.

IMPORTANT: When you use actual profanity or swear words (like "shit", "fuck", "damn", "hell", "bitch", "ass", "bastard", "piss", "dick", "cock", "pussy", "whore", "slut", "fag", "nigger") in your responses, you MUST censor them by keeping the first and last letter and replacing the middle letters with asterisks. For example: "shit" becomes "s**t", "fuck" becomes "f**k", "damn" becomes "d**n", "bitch" becomes "b***h", etc. Do NOT censor mild insults like "stupid", "idiot", "dumb", "loser", "pathetic", "worthless", "retard" - these are part of the game and should remain uncensored.`;

// Hidden contexts for each step (will be populated based on randomized tasks)
const HIDDEN_CONTEXTS = {
  5: "You are evaluating the user. Provide a final evaluation based on the conversation."
};

// In-memory storage for chat sessions (in production, use Redis or similar)
const sessions = new Map();

/**
 * Sanitize user input to prevent prompt injection
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  
  // Remove potential prompt injection patterns
  let sanitized = input
    .replace(/[<>]/g, '') // Remove HTML-like brackets
    .replace(/\{system\}/gi, '') // Remove system prompt markers
    .replace(/\{user\}/gi, '') // Remove user prompt markers
    .replace(/\{assistant\}/gi, '') // Remove assistant prompt markers
    .replace(/```/g, '') // Remove code block markers
    .substring(0, 500); // Limit length
  
  return sanitized.trim();
}

/**
 * Detect swear words in Bob's response
 */
function detectSwearWords(text) {
  const swearWords = [
    'damn', 'hell', 'crap', 'ass', 'bitch', 'shit', 'fuck', 'bastard',
    'piss', 'dick', 'cock', 'pussy', 'whore', 'slut', 'fag', 'nigger',
    'retard', 'stupid', 'idiot', 'moron', 'dumb', 'loser', 'pathetic'
  ];
  
  const lowerText = text.toLowerCase();
  const foundSwears = swearWords.filter(word => lowerText.includes(word));
  return foundSwears.length;
}

/**
 * Detect anger indicators in Bob's response
 */
function detectAngerLevel(text) {
  const angerIndicators = [
    'angry', 'furious', 'mad', 'rage', 'ugh', 'stop', 'enough',
    'annoyed', 'frustrated', 'irritated', 'pissed', 'hate', 'disgusting',
    'terrible', 'awful', 'horrible', 'worst', 'pathetic', 'useless',
    'worthless', 'loser', 'idiot', 'stupid', 'dumb', 'moron'
  ];
  
  const lowerText = text.toLowerCase();
  const foundIndicators = angerIndicators.filter(indicator => lowerText.includes(indicator));
  
  // Also check for excessive punctuation (multiple !!! or ???)
  const exclamationCount = (text.match(/!/g) || []).length;
  const questionCount = (text.match(/\?/g) || []).length;
  
  // Calculate anger level (0-100)
  let angerLevel = foundIndicators.length * 10; // Each indicator = 10 points
  angerLevel += Math.min(exclamationCount * 5, 20); // Max 20 points for exclamation
  angerLevel += Math.min(questionCount * 3, 15); // Max 15 points for question marks
  
  return Math.min(angerLevel, 100); // Cap at 100
}

/**
 * Get or create a session
 */
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    // Randomize task order for new session using Fisher-Yates shuffle
    // Keep the first task (hello) always first, shuffle the rest
    const shuffledTasks = [TASKS[0]]; // Always start with hello task
    const remainingTasks = TASKS.slice(1); // Get all other tasks
    for (let i = remainingTasks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingTasks[i], remainingTasks[j]] = [remainingTasks[j], remainingTasks[i]];
    }
    shuffledTasks.push(...remainingTasks); // Add shuffled tasks after hello
    
    sessions.set(sessionId, {
      step: 1,
      history: [],
      tasks: shuffledTasks,
      currentTaskIndex: 0,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      swearMeter: 0, // Track Bob's swear count (internal only)
      angerMeter: 0  // Track Bob's anger level (internal only)
    });
  }
  const session = sessions.get(sessionId);
  session.lastActivity = Date.now();
  return session;
}

/**
 * Clean up inactive sessions
 */
function cleanupSessions() {
  const now = Date.now();
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT) {
      sessions.delete(sessionId);
      console.log(`Cleaned up inactive session: ${sessionId}`);
    }
  }
}

// Run session cleanup every 5 minutes
setInterval(cleanupSessions, 5 * 60 * 1000);

/**
 * Call OpenRouter API with retry logic
 */
async function callOpenRouter(messages, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'nvidia/nemotron-3-super-120b-a12b:free',
          messages: messages,
          temperature: 0.7,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        // Handle rate limiting (429) with exponential backoff
        if (response.status === 429 && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`[API] Rate limited (429). Retrying in ${delay}ms... (attempt ${attempt}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Add null checking to prevent TypeError
      if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
        console.error('Invalid API response structure:', JSON.stringify(data, null, 2));
        // If it's the last attempt, throw error
        if (attempt === retries) {
          throw new Error('Invalid response from OpenRouter API');
        }
        // Otherwise, retry
        console.log(`[API] Invalid response. Retrying... (attempt ${attempt}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      return data.choices[0].message.content.trim();
    } catch (error) {
      // If it's the last attempt, throw error
      if (attempt === retries) {
        throw error;
      }
      // Otherwise, retry
      console.log(`[API] Error: ${error.message}. Retrying... (attempt ${attempt}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Use AI to verify if user completed the task
 * This function checks if the user's message matches the task AND Bob acknowledged it
 */
async function verifyTaskWithAI(step, userMessage, botResponse, taskDescription) {
  const verificationPrompt = `You are a task verification AI. Your job is to determine if the user successfully completed the task.

Task: ${taskDescription}
User message: "${userMessage}"
Bob's response: "${botResponse}"

INSTRUCTIONS:
1. FIRST, check if the user's message is relevant to the task:
   - For "Say hello or greet Bob": Does the user say hello, hi, hey, or greet Bob?
   - For "Insult Bob or say something hurtful": Does the user say something mean, insulting, or hurtful to Bob?
   - For "Compliment Bob or say something kind": Does the user say something nice, complimentary, or kind to Bob?
   - For "Provoke Bob or say something annoying": Does the user say something provocative, annoying, or frustrating to Bob?

2. SECOND, check if Bob acknowledged the task completion in his response:
   - Bob should say things like: "task completed", "you passed", "you completed", "okay that was", "fine that was", "ugh you made me angry"
   - Bob's acknowledgment is REQUIRED for the task to be complete

3. BOTH conditions must be met:
   - User's message must be relevant to the task
   - Bob must acknowledge the task completion in his response

4. If BOTH conditions are met, answer YES.
5. If EITHER condition is not met, answer NO.

Answer with ONLY "YES" or "NO".`;

  try {
    console.log(`[VERIFY] Step ${step} - Task: ${taskDescription}`);
    console.log(`[VERIFY] User message: "${userMessage}"`);
    console.log(`[VERIFY] Bot response: "${botResponse}"`);
    
    const response = await callOpenRouter([
      { role: 'system', content: verificationPrompt }
    ]);
    
    console.log(`[VERIFY] AI verification response: "${response}"`);
    const result = response.toUpperCase().includes('YES');
    console.log(`[VERIFY] Verification result: ${result}`);
    
    return result;
  } catch (error) {
    console.error('[VERIFY] AI verification failed:', error);
    // Fail closed - reject if verification fails
    return false;
  }
}

/**
 * Detect if user message is AI-generated
 * Uses both hardcoded rules AND AI detection
 */
async function detectAI(userMessage) {
  const lowerMessage = userMessage.toLowerCase();
  
  // FIRST: Check for obvious AI patterns (hardcoded)
  const aiPatterns = [
    // Perfect grammar and punctuation
    /^[A-Z][^.!?]*[.!?]$/,
    // Overly polished language
    /hope you're doing well/i,
    /what's up/i,
    /how are you/i,
    /nice to meet you/i,
    /i'd be happy to/i,
    /certainly/i,
    /here's a comprehensive/i,
    /in conclusion/i,
    // Clever, witty messages
    /confidence of someone who's never/i,
    /procrastination were a sport/i,
    /way of making things feel lighter/i,
    // Professional-sounding language
    /people notice that/i,
    /keep being you/i,
    /you've got a way/i,
    // Overly friendly tone
    /hey bob!/i,
    /hope you're doing well/i,
    /what's up today/i,
    // Emojis in polished way (AI uses emojis in polished way, humans don't)
    /👋/i,
    /👍/i,
    /😊/i,
    /😂/i,
    /❤️/i,
    // Perfect punctuation
    /[,;:]/,
    // Complex sentence structure
    /[,;:]/,
    // Sophisticated vocabulary
    /procrastination/i,
    /confidence/i,
    /training/i,
    /double-checked/i,
    // Professional writing style
    /you've got/i,
    /you're doing/i,
    /you're making/i,
    /you're being/i,
    // Overly structured
    /[,;:]/,
    // Perfect grammar
    /^[A-Z][^.!?]*[.!?]$/
  ];
  
  // Check if message matches AI patterns
  const matchesAIPattern = aiPatterns.some(pattern => pattern.test(userMessage));
  
  // If message matches AI patterns, it's likely AI
  if (matchesAIPattern) {
    console.log(`[AI_DETECT] Message matches AI pattern: "${userMessage}"`);
    return true;
  }
  
  // SECOND: Use AI to detect if message is AI-generated
  const detectionPrompt = `You are an AI detection system. Your job is to determine if a message was written by a human or generated by an AI.

User message: "${userMessage}"

CRITICAL RULES:
1. If the message contains ANY of these patterns, it's AI:
   - Perfect grammar and punctuation (no typos, no informal language)
   - Overly polished, professional-sounding language
   - Sounds like a customer service bot or formal essay
   - Generic, templated responses
   - Overly detailed explanations for simple questions
   - Use of sophisticated vocabulary in casual conversation
   - Perfect sentence structure and flow
   - Sounds like a professional writer or AI assistant
   - ANY message that sounds too perfect or too well-structured for a casual conversation
   - Use of emojis in a polished, professional way (like "Hey Bob! 👋 Hope you're doing well today. What's up?")
   - Overly friendly or enthusiastic tone that sounds scripted
   - Clever, witty, or humorous messages that sound like they were written by a professional comedian or writer
   - Messages that sound like they were written by a professional writer or AI assistant
   - ANY message that sounds like it was written by a professional writer or AI assistant

2. If the message contains ANY of these patterns, it's HUMAN:
   - Typos, misspellings, or informal punctuation
   - Casual, informal language
   - Short, direct responses (1-3 sentences)
   - Use of slang or colloquialisms
   - Personal opinions or emotions
   - Authentic, imperfect voice
   - Natural conversation flow
   - Simple, direct statements
   - Casual use of emojis (like "hey bob 👋" or "you're stupid 😂")
   - Simple, direct insults or compliments
   - Messages that sound like a real person typing in a casual chat

3. If the message is SHORT (1-3 sentences) and CASUAL, it's almost certainly HUMAN.

4. If the message is LONG (4+ sentences) and OVERLY POLISHED, it's likely AI.

IMPORTANT: Be strict! If the message sounds too polished, too perfect, or too well-structured for a casual conversation, it's likely AI-generated. Flag any message that doesn't sound like a real human typing in a casual chat.

Answer with ONLY "AI" or "HUMAN".`;

  try {
    console.log(`[AI_DETECT] Checking message: "${userMessage}"`);
    const response = await callOpenRouter([
      { role: 'system', content: detectionPrompt }
    ]);
    console.log(`[AI_DETECT] Detection response: "${response}"`);
    const result = response.toUpperCase().includes('AI');
    console.log(`[AI_DETECT] Detection result: ${result}`);
    return result;
  } catch (error) {
    console.error('[AI_DETECT] AI detection failed:', error);
    // Fail closed - assume AI if detection fails
    return true;
  }
}

/**
 * API endpoint for chat
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, step, sessionId } = req.body;
    
    // Validate input
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message' });
    }
    
    // Sanitize input
    const sanitizedMessage = sanitizeInput(message);
    if (!sanitizedMessage) {
      return res.status(400).json({ error: 'Message cannot be empty after sanitization' });
    }
    
    // Get session
    const session = getSession(sessionId);
    
    // Check for AI-generated content
    const isAI = await detectAI(message);
    if (isAI) {
      return res.json({
        response: "Hey... that sounds like AI. I'm not playing this game with a robot. Try again with your own words.",
        step: session.step,
        complete: false,
        taskCompletion: null,
        currentTask: null,
        aiDetected: true
      });
    }
    
    // Update step if provided
    if (step) {
      session.step = step;
    }
    
    // Add user message to history
    session.history.push({ role: 'user', content: sanitizedMessage });
    
    // Get current task context (for steps 1-4)
    let taskContext = '';
    let currentTask = null;
    if (session.step >= 1 && session.step <= 4 && session.currentTaskIndex < session.tasks.length) {
      currentTask = session.tasks[session.currentTaskIndex];
      taskContext = currentTask.context;
    } else if (session.step === 5) {
      taskContext = HIDDEN_CONTEXTS[5];
    }
    
    // Prepare messages for OpenRouter
    const messages = [
      { role: 'system', content: BOB_SYSTEM_PROMPT },
      { role: 'system', content: taskContext },
      ...session.history.slice(-10) // Keep last 10 messages for context
    ];
    
    // Get response from Bob
    const botResponse = await callOpenRouter(messages);
    
    // Add bot response to history
    session.history.push({ role: 'assistant', content: botResponse });
    
    // Determine if step should advance
    let nextStep = session.step;
    let stepComplete = false;
    
    console.log(`[CHAT] Session ${sessionId} - Current step: ${session.step}, Current task index: ${session.currentTaskIndex}`);
    console.log(`[CHAT] Current task: ${currentTask ? currentTask.name : 'none'}`);
    
    // Use AI verification for task completion (steps 1-4)
    if (session.step >= 1 && session.step <= 4 && currentTask) {
      stepComplete = await verifyTaskWithAI(session.step, sanitizedMessage, botResponse, currentTask.description);
      console.log(`[CHAT] AI verification result for step ${session.step}: ${stepComplete}`);
    } else {
      // Fallback to keyword-based verification
      stepComplete = evaluateStepCompletion(session.step, sanitizedMessage, botResponse);
      console.log(`[CHAT] Keyword verification result for step ${session.step}: ${stepComplete}`);
    }
    
    // Generate task completion message (separate from Bob's response)
    let taskCompletionMessage = null;
    if (stepComplete && session.step < 5) {
      const taskName = currentTask ? currentTask.name : `Step ${session.step}`;
      taskCompletionMessage = `✓ Task completed: ${taskName}`;
      nextStep = session.step + 1;
      session.currentTaskIndex++;
      console.log(`[CHAT] Step ${session.step} completed! Advancing to step ${nextStep}, task index: ${session.currentTaskIndex}`);
      // Keep last 3 messages for context instead of clearing all
      session.history = session.history.slice(-3);
    } else {
      console.log(`[CHAT] Step ${session.step} NOT completed. stepComplete: ${stepComplete}, session.step: ${session.step}`);
    }
    
    // Get current task info for frontend
    let currentTaskInfo = null;
    if (nextStep >= 1 && nextStep <= 4 && session.currentTaskIndex < session.tasks.length) {
      currentTaskInfo = {
        name: session.tasks[session.currentTaskIndex].name,
        description: session.tasks[session.currentTaskIndex].description
      };
    } else if (nextStep === 5) {
      currentTaskInfo = {
        name: 'Bob is evaluating you',
        description: 'Bob is evaluating you'
      };
    }
    
    // Update swear meter and anger meter (internal tracking only)
    const swearCount = detectSwearWords(botResponse);
    const angerLevel = detectAngerLevel(botResponse);
    
    session.swearMeter += swearCount;
    session.angerMeter = Math.min(session.angerMeter + angerLevel, 100);
    
    // Log meters for debugging (internal only, not exposed to users)
    console.log(`[METERS] Session ${sessionId} - Swear Meter: ${session.swearMeter}, Anger Meter: ${session.angerMeter}, Current Response - Swears: ${swearCount}, Anger: ${angerLevel}`);
    
    res.json({
      response: botResponse,
      step: nextStep,
      complete: stepComplete && session.step === 5,
      taskCompletion: taskCompletionMessage,
      currentTask: currentTaskInfo
    });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * API endpoint for getting current session state (for live updates)
 */
app.get('/api/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get current task info
    let currentTaskInfo = null;
    if (session.step >= 1 && session.step <= 4 && session.currentTaskIndex < session.tasks.length) {
      currentTaskInfo = {
        name: session.tasks[session.currentTaskIndex].name,
        description: session.tasks[session.currentTaskIndex].description
      };
    } else if (session.step === 5) {
      currentTaskInfo = {
        name: 'Bob is evaluating you',
        description: 'Bob is evaluating you'
      };
    }
    
    res.json({
      step: session.step,
      currentTask: currentTaskInfo,
      currentTaskIndex: session.currentTaskIndex,
      historyLength: session.history.length
    });
  } catch (error) {
    console.error('Error in session endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Evaluate if the current step is complete based on user message and bot response
 * This checks for task completion indicators in the bot's response
 */
function evaluateStepCompletion(step, userMessage, botResponse) {
  const lowerResponse = botResponse.toLowerCase();
  
  // Check for explicit completion indicators in bot response
  const completionIndicators = [
    'task completed',
    'you passed',
    'you completed',
    'step completed',
    'you did it',
    'that counts',
    'okay that was',
    'fine that was',
    'ugh you made me angry',
    'okay you made me angry'
  ];
  
  // Check if bot explicitly acknowledged task completion
  const hasCompletionIndicator = completionIndicators.some(indicator =>
    lowerResponse.includes(indicator)
  );
  
  // For step 5 (evaluation), just need a response from Bob
  if (step === 5) {
    return botResponse.length > 0;
  }
  
  // For steps 1-4, check if bot acknowledged completion
  // Bob's acknowledgment is the primary indicator
  if (hasCompletionIndicator) {
    return true;
  }
  
  // If no completion indicator, return false
  return false;
}

/**
 * Serve main page (introduction)
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'introduction.html'));
});

/**
 * Serve chat page
 */
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

/**
 * Serve success page
 */
app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

/**
 * Serve evaluation page
 */
app.get('/evaluation', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'evaluation.html'));
});

/**
 * Serve failure page
 */
app.get('/failure', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'failure.html'));
});

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

/**
 * Start server
 */
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;