# PlanPal – AI Planning Assistant

Live Demo: [https://a441404e.cf-ai-planpal.pages.dev/]

## Overview
PlanPal is a modern AI-powered planning assistant built with Cloudflare Workers, Durable Objects, and a React frontend. It helps users plan trips, events, shopping lists, and more, with robust reminders and beautiful markdown-formatted AI output.

## Features
- **AI Chat**: Ask PlanPal to help you plan anything—trips, events, tasks, and more.
- **Reminders**: Add, edit, and delete reminders with date/time. Get browser notifications and popups for due reminders.
- **Markdown Output**: AI responses are rendered with full markdown support—headings, lists, bold, code, and more.
- **Voice Input**: Dictate your plans and reminders using built-in voice recognition (Chrome/Edge recommended).
- **Chat History**: View, load, and delete previous chat sessions.

## Technologies Used
- **Frontend**:
  - React (TypeScript)
  - Vite
  - react-markdown (for robust markdown rendering)
  - CSS (custom styles for markdown, layout, and reminders)
  - react-icons
- **Backend**:
  - Cloudflare Workers
  - Durable Objects (for reminders and chat memory)
  - Workers AI (for LLM responses)
- **Dev Tools**:
  - Wrangler (Cloudflare CLI)
  - Git & GitHub

## Folder Structure
```
cf_ai_planpal/
  ├── src/         # React app source code
  ├── public/      # Static assets
  ├── App.css      # Main styles
  ├── App.tsx      # Main React component
  ├── README.md    # Frontend readme
backend/
  ├── src/         # Cloudflare Worker code
  ├── wrangler.toml# Worker config
README.md          # Project root readme
```

## How to Test
- Visit the live demo: [https://a441404e.cf-ai-planpal.pages.dev/]
- Try asking PlanPal to plan something ("Plan a 3-day trip to Paris").
- Add reminders and test browser notifications.
- Use voice input for hands-free planning.

## Assignment Notes
- All code is original and built for this assignment.
- No fragile regex hacks—AI output is robustly rendered with markdown.
- Fully deployed on Cloudflare (Workers + Pages).

---
Enjoy planning with PlanPal!

## Assignment Checklist (Cloudflare AI App)
- [x] **LLM**: Uses Workers AI with '@cf/meta/llama-3.1-8b-instruct' and '@cf/meta/llama-3-8b-instruct' models for generating plans and chat responses.
- **Where:** See `backend/src/PlanPalDO.ts` (model selection and AI calls), `backend/src/agent.ts` (AI chat endpoint).
- [x] **Workflow / Coordination**: Built with Cloudflare Workers and Durable Objects for backend logic, reminders, and chat memory.
- **Where:** See `backend/src/worker.ts` (main Worker routing), `backend/src/PlanPalDO.ts` (Durable Object logic).
- [x] **User Input via Chat or Voice**: React frontend supports both chat and voice input (browser speech recognition). Deployed on Cloudflare Pages, as recommended.
- **Where:** See `cf_ai_planpal/src/App.tsx` (chat UI, voice input logic).
- [x] **Memory or State**: Durable Objects store reminders and chat history for each user/session.
- **Where:** See `backend/src/PlanPalDO.ts` (reminder and chat memory storage), `backend/src/worker.ts` (memory endpoints).