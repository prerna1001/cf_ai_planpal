# PlanPal – AI Planning Assistant

Live Demo: [https://a441404e.cf-ai-planpal.pages.dev/]

## Overview
PlanPal is a modern AI-powered planning assistant built with **Cloudflare Agents**, **Durable Objects**, and **Workers AI**. It helps users plan trips, events, shopping lists, and more, with robust reminders and beautiful markdown-formatted AI output.

## Features
- **AI Chat with Agents**: Cloudflare Agents provide persistent conversation history and session management—no manual history shuffling needed!
- **Smart Planning**: Handles trips, weddings, events, concerts, shopping, projects—anything you need to plan
- **Intelligent Formatting**: AI responses with proper markdown—headings, lists, bold, links to restaurants/hotels/attractions
- **Reminders**: Add, edit, and delete reminders with date/time. Get browser notifications and popups for due reminders.
- **Smart Reminder Checking**: Efficient scheduling checks when reminders are due (not constant polling)
- **Voice Input**: Dictate your plans and reminders using built-in voice recognition (Chrome/Edge recommended).
- **Chat History**: View, load, and delete previous chat sessions—conversation state persists across sessions.
- **External Links**: AI includes clickable links for places, restaurants, hotels, and attractions (opens in new tab)
 

## Technologies Used
- **Frontend**:
  - React (TypeScript)
  - Vite
  - react-markdown (for robust markdown rendering)
  - CSS (custom styles for markdown, layout, and reminders)
  - react-icons
- **Backend**:
  - **Cloudflare Agents** (for AI chat with built-in state management)
  - **Cloudflare Workers** (request routing, API endpoints)
  - **Durable Objects** (persistent reminder storage, DO Alarm scheduling)
  - **Workers AI** (LLM inference: '@cf/meta/llama-3-8b-instruct' with 1536 max tokens)
  
- **Dev Tools**:
  - Wrangler (Cloudflare CLI)
  - Git & GitHub

## Architecture: Native Cloudflare Stack

### Memory & State Management
1. **Conversation History**: Cloudflare Agents with `this.state` (automatic persistence)
   - Each Agent instance = one user session (identified by sessionId)
   - Agent state survives restarts and automatically syncs
   - No need for client-side history tracking
   
2. **Reminder Data**: Durable Objects (`PlanPalDO`)
   - Strongly consistent, transactional storage
   - Alarm-based scheduling for due reminders
   - CRUD operations via REST API

3. **Scheduled Tasks**: DO alarms
  - DO alarms trigger when reminders are due (not polling)
  - Frontend uses smart setTimeout scheduling + 30s fallback polling
  - Efficient notification delivery

### How It Works
```
User → Agent (sessionId for chat memory)
         ↓
    AI generates response (Workers AI)
         ↓
    Agent stores in state (POST) → Retrieve via GET /memory/:sessionId
      ↓
    Custom methods call DO for reminders
         ↓
    DO schedules alarms → Notifications
```

## Folder Structure
```
cf_ai_planpal/
  ├── src/         # React app source code
  ├── public/      # Static assets
  ├── App.css      # Main styles
  ├── App.tsx      # Main React component
backend/
  ├── src/
  │   ├── worker.ts          # Main Worker routing
  │   ├── agent.ts           # Cloudflare Agent (chat with state)
  │   ├── PlanPalDO.ts       # Durable Object (reminders, alarms)
  │   └── types.ts           # TypeScript interfaces
  ├── wrangler.toml          # Worker config with Agent bindings
README.md                    # Project root readme
PROMPTS.md                   # Sample prompts used during development
```

## How to Test
- Visit the live demo: [https://a441404e.cf-ai-planpal.pages.dev/]
- Try asking PlanPal to plan something ("Plan a 3-day trip to Paris").
- Continue the conversation—Agent remembers context automatically!
- Add reminders and test browser notifications.
- Use voice input for hands-free planning.
- Start a new chat session to see session isolation.

## Assignment Notes
- **Native Cloudflare Features**: Uses Agents for conversation memory, DOs for reminders, Workers AI for LLM inference.
- **No external dependencies**: All state and memory managed by Cloudflare's platform.
- **Production-ready**: Fully deployed on Cloudflare (Workers + Pages).
- **Clean architecture**: Agent handles chat, DO handles reminders, Worker routes requests.

---
Enjoy planning with PlanPal!

## Assignment Checklist (Cloudflare AI App)
- [x] **LLM**: Uses Workers AI with '@cf/meta/llama-3-8b-instruct' model (max_tokens: 1536) for generating plans and chat responses with proper markdown formatting.
  - **Where:** See `backend/src/agent.ts` (Agent AI calls with Workers AI and system prompt).
  
- [x] **Workflow / Coordination**: Built with **Cloudflare Agents** (for chat orchestration), **Durable Objects** (for reminders and alarms), and **Workers** (for routing).
  - **Where:** See `backend/src/worker.ts` (routing to Agent and DO), `backend/src/agent.ts` (Agent class), `backend/src/PlanPalDO.ts` (DO logic).
  
  
- [x] **User Input via Chat or Voice**: React frontend supports both chat and voice input (browser speech recognition). Deployed on Cloudflare Pages.
  - **Where:** See `cf_ai_planpal/src/App.tsx` (chat UI, voice input, sessionId management).
  
- [x] **Memory or State**: 
  - **Chat History**: Cloudflare Agents' built-in state (`this.state`) automatically persists conversation per session.
  - **Reminders**: Durable Objects store reminder data with alarm-based scheduling.
  - **Where:** See `backend/src/agent.ts` (Agent state for messages), `backend/src/PlanPalDO.ts` (DO storage and alarms).
  
- [x] **Cloudflare-Native Stack**: Fully leverages Cloudflare's platform:
  - Agents SDK for session-based AI chat
  - Durable Objects for stateful reminders
  - Workers AI for LLM inference
  - Pages for frontend deployment