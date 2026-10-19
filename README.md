# Radox AI Full-Stack Chat Application

A high-performance, responsive AI chat platform powered by the **Radox AI Gateway** (`https://radoxai.com/v1`) with full support for Claude models (e.g. Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude Opus), token-by-token Server-Sent Events (SSE) streaming, cancellation, dynamic model discovery, and persistent modular IndexedDB storage.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   React 18 + Vite                      │
│   Tailwind CSS • Lucide Icons • Markdown & Code Blocks │
│         Modular IndexedDB Persistent Storage           │
└───────────────────────────▲────────────────────────────┘
                            │ (SSE Stream / JSON RPC)
                            ▼
┌────────────────────────────────────────────────────────┐
│               Node.js + Express + TypeScript           │
│     Zod Validation • Helmet • Rate Limiter • CORS      │
│        Stream Cancellation Registry & Sanitizer        │
└───────────────────────────▲────────────────────────────┘
                            │ OpenAI SDK (Custom Base URL)
                            ▼
┌────────────────────────────────────────────────────────┐
│              Radox AI Gateway (/v1)                    │
│   GET /models • POST /chat/completions (Stream: true)  │
│          Claude / GPT / DeepSeek / Qwen Catalog        │
└────────────────────────────────────────────────────────┘
```

---

## 1. Features

- **Radox AI Gateway Integration**: Directly utilizes the official OpenAI Node.js SDK configured with Radox AI's gateway endpoint (`https://radoxai.com/v1`).
- **Claude & Multi-Model Support**: Dynamically retrieves all available models from `GET /models`, highlights Claude models, and adapts to reported capabilities (streaming, vision, reasoning).
- **Real Token-by-Token Streaming**: Uses Server-Sent Events (SSE) to deliver tokens instantly to the UI with active cursor animation and typing indicator.
- **Bi-Directional Cancellation**: Generation can be aborted instantly from the UI via client-side `AbortController` and backend cancellation mapping (`DELETE /api/chat/stream/:requestId`).
- **Complete Context Preservation**: Maintains multi-turn conversation history across follow-up turns without loss of context.
- **Local Rules Title Generation**: Generates clean conversation titles locally from the first user prompt without consuming paid API credits.
- **Modular Storage Layer**: Persistent browser storage via IndexedDB behind a standardized `IStorageService` interface (easily swappable for PostgreSQL / user authentication).
- **Polished Responsive Interface**:
  - Dark theme by default with Dark / Light / System theme toggle.
  - Collapsible desktop sidebar and mobile slide-out drawer.
  - Auto-scrolling message container that detects user scroll-up and displays a "Scroll to bottom" button.
  - Markdown rendering with GitHub Flavored Markdown (tables, lists, blockquotes, safe links).
  - Code blocks with syntax formatting and one-click copy buttons.
  - Message edit and resubmit capability.
  - Response regeneration.
  - Conversation search, rename, and delete actions.
- **Enterprise Security**:
  - API keys are strictly kept on the backend environment (`RADOX_API_KEY`).
  - Strict input validation using Zod.
  - Rate limiting via `express-rate-limit`.
  - Content Security Headers via `helmet`.
  - Error sanitizer ensuring no keys, internal paths, or stack traces leak to the client.

---

## 2. Project Structure

```
.
├── package.json                 # Monorepo workspaces & unified scripts
├── .gitignore                   # Excludes node_modules, build outputs, .env
├── .env.example                 # Root configuration template
├── README.md                    # System documentation and deployment guide
│
├── backend/                     # Node.js Express TypeScript API
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── src/
│   │   ├── server.ts            # Entrypoint, port listener & graceful shutdown
│   │   ├── app.ts               # Express app, helmet, cors, rate limiter, routes
│   │   ├── config.ts            # Typed environment variables
│   │   ├── routes/
│   │   │   ├── health.ts        # GET /api/health & GET /api/health/provider
│   │   │   ├── models.ts        # GET /api/models (Dynamic catalog)
│   │   │   └── chat.ts          # POST /api/chat, POST /api/chat/stream, DELETE
│   │   ├── services/
│   │   │   └── aiProvider.ts    # Radox AI gateway service (OpenAI SDK + SSE)
│   │   ├── middleware/
│   │   │   ├── errorHandler.ts  # Scrubbed, safe operational errors
│   │   │   ├── rateLimiter.ts   # Tiered IP rate limiting
│   │   │   └── requestValidator.ts # Zod schema middleware
│   │   └── schemas/
│   │       └── chatSchema.ts    # Message and completion schemas
│   └── tests/                   # Vitest unit and integration test suite
│       ├── health.test.ts
│       ├── models.test.ts
│       ├── chat.test.ts
│       └── streaming.test.ts
│
└── frontend/                    # React 18 + Vite + Tailwind CSS SPA
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts           # Development proxy & build settings
    ├── tailwind.config.js       # Dark mode theme & custom palette
    ├── src/
    │   ├── main.tsx             # React mount
    │   ├── App.tsx              # Application layout orchestrator
    │   ├── index.css            # Tailwind & prose styles
    │   ├── types/               # TypeScript interfaces
    │   ├── services/
    │   │   ├── api.ts           # Backend HTTP & SSE streaming client
    │   │   └── storage.ts       # Modular IndexedDB persistence
    │   ├── hooks/
    │   │   ├── useChat.ts       # Streaming, abort, retry, edit state machine
    │   │   ├── useConversations.ts # IndexedDB conversation CRUD & search
    │   │   ├── useModels.ts     # Dynamic model fetching & selection
    │   │   └── useSettings.ts   # Theme & streaming preferences
    │   ├── components/
    │   │   ├── chat/            # ChatArea, MessageItem, Composer, CodeBlock
    │   │   ├── layout/          # Sidebar, TopNav, MobileDrawer
    │   │   ├── model/           # ModelSelector with search & capability badges
    │   │   └── settings/        # SettingsModal with live provider test
    │   └── tests/               # Frontend storage and titling tests
```

---

## 3. Environment Configuration

Copy `.env.example` to `backend/.env`:

```bash
cp .env.example backend/.env
```

Edit `backend/.env` with your settings:

```env
# ===================================================================
# Radox AI Provider Configuration
# ===================================================================
# Obtain your key from your Radox AI Dashboard (https://radoxai.com)
# Format starts with `cc_` followed by 48 characters
RADOX_API_KEY=cc_your_radox_api_key_here
RADOX_BASE_URL=https://radoxai.com/v1

# Backend Server Configuration
PORT=4000
NODE_ENV=development

# Allowed Frontend Origins for CORS (comma-separated)
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60

# Request Timeout
REQUEST_TIMEOUT_MS=60000
```

> **Security Note:** Never commit `backend/.env` or paste actual API keys in public repositories or client-facing bundles.

---

## 4. Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Both Frontend and Backend Concurrently
```bash
npm run dev
```
- Backend starts at `http://localhost:4000`
- Frontend starts at `http://localhost:5173`
- Vite automatically proxies `/api` requests to `http://localhost:4000`.

### 3. Run Applications Individually
```bash
# Backend only:
npm run dev:backend

# Frontend only:
npm run dev:frontend
```

---

## 5. Automated & Manual Testing

### Automated Test Suites
Run the automated test suite across both frontend and backend:

```bash
npm test
```

Or execute tests per workspace:
```bash
# Backend tests (Health, Models, Chat, Streaming, Cancellation):
npm run test:backend

# Frontend tests (Storage persistence, titling logic):
npm run test:frontend
```

### Manual Testing Procedure with a Real Radox AI Key

1. **Configure API Key**:
   In `backend/.env`, set `RADOX_API_KEY=cc_...` using your active key.
2. **Start Backend**:
   Run `npm run dev:backend`. Check console output to ensure it logs:
   ```
   🔑 Provider Key: Configured ✅
   ```
3. **Verify Health & Provider Ping**:
   Open a terminal and run:
   ```bash
   curl http://localhost:4000/api/health/provider
   ```
   Verify you receive a `200 OK` response with `status: "ok"`, latency in milliseconds, and the count of available models.
4. **Verify Dynamic Models**:
   ```bash
   curl http://localhost:4000/api/models
   ```
   Confirm that models list includes Claude models (e.g. `claude-3-7-sonnet`, `claude-3-5-sonnet`) with flags `isClaude: true`.
5. **Verify SSE Streaming**:
   Open the web app at `http://localhost:5173`.
   - Select a Claude model in the top navigation.
   - Send: `"Write a quick quicksort implementation in TypeScript"`.
   - Observe tokens arriving smoothly one-by-one.
   - Click the red **Stop** button midway to verify instant cancellation.
6. **Verify Chat Editing & Regeneration**:
   - Hover over your previous message, click the **Pencil** icon, edit the prompt, and click **Save & Resubmit**.
   - Hover over an assistant response and click the **Regenerate** icon.
7. **Verify Persistent Storage**:
   - Refresh the browser tab. Notice all conversations remain stored in IndexedDB.
   - Use the sidebar search bar to find keywords across conversations.

---

## 6. Production Build

Build both frontend and backend artifacts:

```bash
npm run build
```

This compiles:
- Backend TypeScript into `./backend/dist/`
- Frontend Vite assets into `./frontend/dist/`

---

## 7. Production Deployment on Ubuntu VPS

### Step 1: Server Preparation
SSH into your Ubuntu server (Ubuntu 22.04 LTS or 24.04 LTS recommended):

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx certbot python3-certbot-nginx
```

Install Node.js 20 LTS or 22 LTS:
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### Step 2: Clone & Configure Repository
```bash
cd /var/www
git clone <your-repository-url> radox-chat
cd radox-chat

# Install dependencies and build
npm install
npm run build

# Configure production environment
cp .env.example backend/.env
nano backend/.env
```
Ensure `NODE_ENV=production` and `ALLOWED_ORIGINS=https://yourdomain.com`.

### Step 3: Run Backend with PM2 (Process Manager)
```bash
cd /var/www/radox-chat/backend
pm2 start dist/server.js --name "radox-backend" --node-args="--max-old-space-size=1024"
pm2 save
pm2 startup
```

### Step 4: Configure Nginx Reverse Proxy with SSE Support
Create the Nginx site configuration:
```bash
sudo nano /etc/nginx/sites-available/radox-chat
```

Paste the following configuration (replace `yourdomain.com` with your domain):

```nginx
server {
    server_name yourdomain.com;

    # Frontend Single-Page App static assets
    root /var/www/radox-chat/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API and Server-Sent Events (SSE) Reverse Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # =========================================================
        # CRITICAL SETTINGS FOR SERVER-SENT EVENTS (SSE) STREAMING:
        # =========================================================
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

Enable the site and test the configuration:
```bash
sudo ln -s /etc/nginx/sites-available/radox-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 5: Secure with SSL (HTTPS)
```bash
sudo certbot --nginx -d yourdomain.com
```
Certbot will configure HTTPS certificates and auto-renewal.

### Step 6: Verify Streaming Through Nginx
Test real-time token streaming through your Nginx reverse proxy with curl:
```bash
curl -N -H "Content-Type: application/json" \
  -d '{"model":"claude-3-7-sonnet","messages":[{"role":"user","content":"Say hello"}]}' \
  https://yourdomain.com/api/chat/stream
```
You should see `event: init`, followed by continuous `event: chunk` emissions without proxy delays.

---

## 8. Separate Frontend and Backend Deployment

If deploying frontend and backend independently:

- **Frontend on Vercel / Netlify / Cloudflare Pages**:
  - Build command: `npm run build`
  - Output directory: `dist`
  - Set Environment Variable: `VITE_API_BASE_URL=https://api.yourdomain.com`
- **Backend on Render / Fly.io / Railway / ECS**:
  - Start command: `node dist/server.js`
  - Set Environment Variables:
    - `RADOX_API_KEY=cc_...`
    - `ALLOWED_ORIGINS=https://your-frontend.vercel.app`
    - `PORT=4000`

---

## 9. Security, Authentication, and Quotas

- **Single-User / Private Deployment**: This initial version is configured for single-user or private internal deployments.
- **Multi-Tenant Deployment Notice**: Before opening an instance to the general public:
  1. Add authentication (e.g. NextAuth, Supabase Auth, or JWT middleware).
  2. Implement per-user rate limits and credit/token quotas in the backend database.
  3. Restrict available models by role or subscription tier.
