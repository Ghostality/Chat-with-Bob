# CAPTCHA: Chat With Bob

An interactive CAPTCHA system where users must converse with an AI character named Bob to pass verification. The experience is minimal, modern, and subtly unsettling.

## Features

- **Interactive AI Chat**: Converse with Bob, an emotional and reactive AI character
- **Step-Based Verification**: Complete 4 conversation steps to pass
- **Modern UI**: Clean, dark-themed interface with smooth animations
- **Secure Architecture**: Backend proxy protects API keys
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

### Frontend
- HTML5
- CSS3 (Vanilla)
- Vanilla JavaScript

### Backend
- Node.js
- Express.js
- OpenRouter API (GPT-3.5-turbo)

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- OpenRouter API key (get from [openrouter.ai](https://openrouter.ai/))

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd captcha-chat-with-bob
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   OPENROUTER_API_KEY=your_api_key_here
   PORT=3000
   ```
   
   Replace `your_api_key_here` with your actual OpenRouter API key.

4. **Start the server**
   ```bash
   # Production
   npm start
   
   # Development (with auto-reload)
   npm run dev
   ```

5. **Open in browser**
   
   Navigate to `http://localhost:3000`

## How It Works

### User Flow

1. **Initial State**: User sees the chat interface with Bob's greeting
2. **Step 1**: "Say hello or greet Bob" - User must greet Bob
3. **Step 2**: User must chat with Bob according to instructions given above the chatbox
4. **Step 3**: "Bob is evaluating you" - Final evaluation
5. **Success**: User is redirected to the success page

### Architecture

```
┌─────────────────┐
│   Frontend      │
│  (Browser)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Backend       │
│  (Express)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  OpenRouter API │
└─────────────────┘
```

### Security

- API key is stored in `.env` and never exposed to the frontend
- All API calls are made through the backend proxy
- CORS is configured for local development

## API Endpoints

### POST /api/chat

Send a message to Bob and receive a response.

**Request Body:**
```json
{
  "message": "string",
  "step": 1,
  "history": []
}
```

**Response:**
```json
{
  "response": "string"
}
```

### GET /

Serves the main chat interface.

### GET /success

Serves the success page.

## Bob's Personality

Bob is designed to be:
- **Emotional**: Reacts to user tone and content
- **Reactive**: Responses change based on hidden context
- **Slightly Unstable**: Occasionally awkward or inconsistent
- **Roasty**: Especially when users are rude

### System Prompt

Bob follows a carefully crafted system prompt that ensures he:
- Keeps responses short (1-2 sentences)
- Uses casual, lowercase language
- Never breaks character
- Never mentions being an AI

## Customization

### Changing Step Hints

Edit the `stepHints` object in [`public/script.js`](public/script.js:12):

```javascript
this.stepHints = {
  1: "Your custom hint here",
  2: "Another hint",
  // ...
};
```

### Modifying Bob's Personality

Edit the system prompt in [`server.js`](server.js:30):

```javascript
const BOB_SYSTEM_PROMPT = `Your custom prompt here`;
```

### Adjusting Hidden Contexts

Edit the `HIDDEN_CONTEXTS` object in [`server.js`](server.js:48):

```javascript
const HIDDEN_CONTEXTS = {
  1: "Custom context for step 1",
  // ...
};
```

## Development

### Project Structure

```
captcha-chat-with-bob/
├── public/
│   ├── chat.html       # Main chat interface
│   ├── style.css       # Styling
│   ├── script.js       # Frontend logic
│   └── success.html    # Success page
├── server.js           # Express backend
├── package.json        # Dependencies
├── .env                # Environment variables
├── .gitignore          # Git ignore rules
└── README.md           # Documentation
```

### Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server with auto-reload

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

If you encounter any issues, please open an issue in the repository.
