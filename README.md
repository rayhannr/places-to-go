# 📍 Places To Go

An AI-powered personal food tracker that lives in your **browser** and your **Telegram**. Manage your favorite spots, get smart recommendations, and never forget a great meal again.

![Premium UI](https://img.shields.io/badge/Aesthetic-Midnight%20%26%20Neon-blueviolet)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Mistral AI](https://img.shields.io/badge/AI-Mistral-orange)

## ✨ Features

- **🗣️ Tri-lingual AI**: Chat naturally in English, Indonesian, or Javanese.
- **🤖 24/7 Telegram Bot**: Add places and get suggestions on the go.
- **🗺️ Smart Links**: Just paste a Google Maps link, and the AI handles the rest (Name, City, Distance, Travel Time).
- **🔋 Powered by Google Sheets**: Your data is yours. Easy to view, edit, and export manually.
- **🎯 Smart Recommendations**:
  - `Nearby`: Find spots closest to you.
  - `Quickest`: Find spots with the shortest travel time.
  - `Surprise Me`: Random picks from your list.
  - `By City`: Filter spots in a specific city.
  - `Search by Name`: Fuzzy search your tracker by place name.
- **🌍 Global Discovery**: Search for new places directly on Google Maps (outside your tracker). Returns top 3 results with a direct Maps link.
- **✅ Visit Tracking**:
  - Mark places as visited to keep track of your journey.
  - `Unvisit`: Easily clear visit dates if you make a mistake.
- **🗑️ Delete Capability**:
  - Delete places permanently from your tracker.
  - Automatically shifts up subsequent rows in Google Sheets to keep it clean.
- **🌌 Midnight & Neon UI**: A sleek, high-contrast dark theme with glassmorphism.
- **📍 Real-time Geolocation**: 
  - Web: One-click "Go Live" location tracking.
  - Telegram: Send your pin for persistent, cross-platform location sync.
  - `Smart Recalculation`: Only updates your list when you move >2km.
- **🔔 Sonner Notifications**: High-end toast notifications for real-time status updates.
- **🎡 Wheel of Places**: Spin an interactive wheel to randomly decide where to eat. Cherry-pick entries, filter by visit status, and search by name or city. Already-picked places are struck through and excluded from subsequent spins.
- **🔌 Model Context Protocol (MCP)**: Connect your tracker directly to AI clients (like Claude Desktop) via a built-in MCP server endpoint (`/api/mcp`).

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **AI**: Vercel AI SDK v6 + Mistral AI
- **Bot**: grammY
- **Database**: Google Sheets API
- **Geo**: Google Routes API (Distance Matrix v2)
- **UI Components**: Shadcn UI & Sonner
- **Styling**: Tailwind CSS 4
- **MCP**: Model Context Protocol SDK

## 🚀 Getting Started

### 1. Prerequisites
- A Google Cloud Project with Sheets, Geocoding, and Routes APIs enabled.
- A service account with access to your Google Sheet.
- A Telegram Bot token from [@BotFather](https://t.me/BotFather).
- Mistral AI API Key.

### 2. Environment Variables
Create a `.env` file based on the following:

```env
MISTRAL_API_KEY=your_key
SPREADSHEET_ID=your_sheet_id
GMAPS_API_KEY=your_key
GOOGLE_APPLICATION_CREDENTIALS=path_to_json
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_ALLOWED_USER_ID=your_id
REFERENCE_LAT=your_home_lat
REFERENCE_LNG=your_home_lng

# Optional: enable demo mode (no Google credentials needed)
DEMO_MODE=true
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
```

> **Demo Mode**: Designed for public or portfolio deployments where you don't want to expose your personal Google Sheet. When `DEMO_MODE=true`, the app uses Vercel Blob storage instead of Google Sheets — no Google credentials required. The Telegram bot is disabled and a 75-place limit is enforced to keep the shared store clean.

### 3. Installation
```bash
npm install
```

### 4. Running Locally
```bash
npm run dev
```

### 5. Telegram Webhook Setup
To use the Telegram bot in production or with a tunnel:
```bash
npm run telegram:set-webhook
```

### 6. Model Context Protocol (MCP) Setup
You can connect this app directly to MCP-compatible AI clients (such as Claude Desktop) as a remote tool server.

The endpoint is served at `/api/mcp` (disabled when `DEMO_MODE=true`).

#### Claude Desktop Integration
Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "places-to-go": {
      "transport": {
        "type": "sse",
        "url": "http://localhost:3000/api/mcp"
      }
    }
  }
}
```

## 📖 Related Documents
- [AGENTS.md](./AGENTS.md): Detailed technical specification and architecture.
- [CLAUDE.md](./CLAUDE.md): Development guidelines and command reference.

## 📝 License
MIT
