# 📍 Places To Go

An AI-powered personal food tracker that lives in your **browser** and your **Telegram**. Manage your favorite spots, get smart recommendations, and never forget a great meal again.

![Premium UI](https://img.shields.io/badge/Aesthetic-Midnight%20%26%20Neon-blueviolet)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Mistral AI](https://img.shields.io/badge/AI-Mistral-orange)

## ✨ Features

- **🗣️ Tri-lingual AI**: Chat naturally in English, Indonesian, or Javanese.
- **🤖 24/7 Telegram Bot**: Add places and get suggestions on the go.
- **🗺️ Smart Links**: Just paste a Google Maps link, and the AI handles the rest (Name, City, Distance, Travel Time).
- **🔋 Powered by Google Sheets**: Your data is yours. Easy to view, edit, and export manually.
- **🎯 Smart Recomendations**:
  - `Nearby`: Find spots closest to you.
  - `Quickest`: Find spots with the shortest travel time.
  - `Surprise Me`: Random picks from your list.
- **✅ Visit Tracking**:
  - Mark places as visited to keep track of your journey.
  - `Unvisit`: Easily clear visit dates if you make a mistake.
- **🌌 Midnight & Neon UI**: A sleek, high-contrast dark theme with glassmorphism.
- **📍 Real-time Geolocation**: 
  - Web: One-click "Go Live" location tracking.
  - Telegram: Send your pin for persistent, cross-platform location sync.
  - `Smart Recalculation`: Only updates your list when you move >2km.
- **🔔 Sonner Notifications**: High-end toast notifications for real-time status updates.

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **AI**: Vercel AI SDK v6 + Mistral AI
- **Bot**: grammY
- **Database**: Google Sheets API
- **Geo**: Google Routes API (Distance Matrix v2)
- **UI Components**: Shadcn UI & Sonner
- **Styling**: Tailwind CSS 4

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
```

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

## 📖 Related Documents
- [AGENTS.md](./AGENTS.md): Detailed technical specification and architecture.
- [CLAUDE.md](./CLAUDE.md): Development guidelines and command reference.

## 📝 License
MIT
