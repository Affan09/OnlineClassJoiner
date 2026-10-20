# Classroom Class Joiner (Web Edition) 🌐🎓

[![React](https://img.shields.io/badge/React-18.3.1-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.4.9-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Deploy with Vercel](https://img.shields.io/badge/Vercel-Deployed-black?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-crimson.svg?style=flat-square)](LICENSE)

An automated schedule manager, countdown tracker, and Google Classroom / Google Meet companion tool built for students. 

This **Web Edition** is a pure browser-native port of the desktop application. It requires **no local installation, no Python/Electron backend, and zero server infrastructure**—everything runs 100% client-side directly in your browser.

---

## ✨ Features

- 🕒 **Live Countdown Banner**: Real-time ticker displaying the exact days, hours, and minutes until your next scheduled class.
- 🚀 **Auto Tab Launcher**: Automatically triggers and opens your course link (Google Classroom or Google Meet) in a new browser tab right when class begins.
- 🔔 **Native Browser Notifications**: Sends desktop and mobile system push notifications when class is starting.
- 🎵 **Web Audio Chime**: Synthesizes a pleasant audio chime tone via the Web Audio API when your scheduled start time arrives.
- ⚡ **Instant Join ("Join Now")**: Jump into any class immediately with a single click, bypassing wait timers.
- 🕰️ **Interactive Analog Time Picker**: Set start and end times effortlessly using an interactive visual clock face or slot presets.
- 💾 **100% Client-Side Storage**: Courses, schedules, and custom settings persist securely in your browser's `localStorage`—no database or account required.
- 📟 **Built-in Live Console**: Collapsible interactive terminal displaying timestamped events, status updates, and operation logs.
- 📱 **Mobile & Phone Optimized**: Responsive touch-first UI with notch/safe-area support, mobile audio unlock, and adaptive controls for iOS Safari and Android Chrome.
- 🌓 **Obsidian & Pure White Themes**: Seamlessly switch between dark mode (deep obsidian with crimson accents) and light mode (crisp slate-white).

---

## 🏗️ Architecture: The Browser Web Adapter

The original application relied on an Electron IPC bridge (`window.electronAPI`). For the **Web Edition**, a lightweight, high-performance browser adapter (`src/services/webAdapter.ts`) replaces the Electron backend:

```
┌────────────────────────────────────────────────────────┐
│                   React 18 Dashboard                   │
│   (Countdown Banner, Class Cards, Modals, Terminal)    │
└───────────────────────────┬────────────────────────────┘
                            │
               window.electronAPI Interface
                            │
┌───────────────────────────▼────────────────────────────┐
│              Browser-Native Web Adapter                │
│                                                        │
│  • LocalStorage (Data Persistence)                     │
│  • Web Audio API (Synthesized Tone Chime)              │
│  • Notification API (Desktop / Mobile Alerts)          │
│  • Window Scheduler & Window Tab Launcher              │
│  • In-Memory Event Dispatcher (Logs & Status)          │
└────────────────────────────────────────────────────────┘
```

When opened in any web browser, the app detects that Electron is absent and automatically attaches the Web Adapter without changing a single line in your React components.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` or `pnpm` / `yarn`

### Installation

1. **Clone or navigate to the project directory**:
   ```bash
   cd "ClassJoiner Web"
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the local Vite development server**:
   ```bash
   npm run dev:vite
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

4. **Build the production web bundle**:
   ```bash
   npm run build:web
   ```
   Outputs the optimized, minified static site to the `dist/` directory.

5. **Preview the production build locally**:
   ```bash
   npm run preview
   ```

---

## 🌐 Deployment Guide

The web port is pre-configured for seamless deployment to static hosting platforms:

### 1. Deploying to Vercel (Recommended)

1. Push your repository to **GitHub**.
2. Go to [Vercel](https://vercel.com/) and click **Add New...** -> **Project**.
3. Import your GitHub repository.
4. Verify the build settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (or `ClassJoiner Web` if the project lives inside a subfolder)
   - **Build Command**: `npm run build:web`
   - **Output Directory**: `dist`
5. Click **Deploy**.

> **Note**: A production-ready [`vercel.json`](vercel.json) is already included with single-page-app (SPA) rewrites.

---

### 2. Deploying to Netlify

1. Link your GitHub repository in [Netlify](https://www.netlify.com/).
2. Netlify will automatically detect configuration from [`netlify.toml`](netlify.toml):
   - **Build command**: `npm run build:web`
   - **Publish directory**: `dist`
3. Click **Deploy site**.

---

### 3. Deploying to GitHub Pages

1. Build the production files:
   ```bash
   npm run build:web
   ```
2. Push the contents of the generated `dist/` directory to your `gh-pages` branch, or configure a GitHub Actions workflow to publish the `dist` artifact.

---

## 📁 Project Structure

```text
ClassJoiner Web/
├── dist/                      # Production build output
├── public/                    # Static assets
├── src/
│   ├── components/
│   │   ├── ClassCard.tsx      # Course card UI with auto-join toggle & quick actions
│   │   ├── LiveConsole.tsx    # Collapsible terminal console with filterable logs
│   │   └── TimePicker.tsx     # Visual analog clock dial & slot preset selector
│   ├── services/
│   │   └── webAdapter.ts      # Pure-browser bridge replacing Electron IPC
│   ├── App.css                # Obsidian & Light theme stylesheets
│   ├── App.tsx                # Main dashboard & scheduling state container
│   ├── main.tsx               # Application bootstrap & Web Adapter initialization
│   └── vite-env.d.ts          # Vite & browser environment definitions
├── index.html                 # HTML entry point
├── netlify.toml               # Netlify hosting configuration
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── vercel.json                # Vercel routing and build configuration
└── vite.config.ts             # Vite build & alias configuration
```

---

## ⚙️ Browser Permissions & Best Practices

To make the most of automated classroom joining:

- **Notifications**: When prompted, click **Allow** on browser notification requests so the app can alert you even when the tab is in the background.
- **Audio Chime**: Modern browsers require at least one user interaction (such as clicking anywhere on the page) before allowing background Web Audio playback.
- **Pop-ups / New Tabs**: Ensure your browser allows pop-ups for your deployed domain so the Auto Tab Launcher can open Google Classroom or Google Meet links without being blocked.
- **Background Tabs**: Keep the Class Joiner tab open in your browser or pinned to your tab bar during your class days so the internal clock can track upcoming classes.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
