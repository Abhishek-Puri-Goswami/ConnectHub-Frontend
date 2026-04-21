# ConnectHub â€” Claymorphism Chat Application

A modern real-time chat app with a **claymorphism** UI design, built with React + Vite.

## Design System

- **Style**: Claymorphism â€” soft shadows, rounded surfaces, inset inputs, gradient badges
- **Palette**: Coral `#FF8E72` Â· Mint `#7AC9A7` Â· Lavender `#B8A4F4` Â· Cream `#FDF6EC` Â· Plum `#1A1625`
- **Font**: Plus Jakarta Sans (primary), JetBrains Mono (code)
- **Dark/Light mode** with `data-theme` attribute, persisted to localStorage, respects system preference
- **Responsive** â€” sidebar becomes slide-out drawer below 900px

## Auth Features

### Sign Up (Register)
- **All fields required**: Full Name (auto-capitalized), Username (lowercase + digits + underscores only), Email, Phone (+91 India), Password, Confirm Password
- **Email verification**: Inline "Verify" button â†’ sends OTP â†’ 6-digit input â†’ âœ“ Verified chip
- **Phone verification**: Same flow with SMS OTP
- **Password**: Live strength meter (5 criteria), match indicator
- **Submit disabled** until both email and phone are verified

### Login (4 methods)
1. **Email + OTP** â€” enter email â†’ receive code â†’ auto-verify on 6th digit
2. **Phone + OTP** â€” enter +91 number â†’ receive code â†’ auto-verify
3. **Username/Email + Password** â€” classic login with remember-me + forgot password link
4. **OAuth2** â€” Google and GitHub buttons

### Other Auth Pages
- **Verify Email** â€” standalone OTP page for unverified accounts
- **Forgot Password** â€” 3-step flow: email â†’ OTP â†’ new password with strength meter
- **OAuth2 Callback** â€” loading/error states

## Chat Features

- **Sidebar**: Channels + DMs list, unread badges, search, quick-create buttons, user card, theme toggle, logout
- **Chat Area**: Message list with day separators, skeletons, scroll-to-bottom, pinned message banner, typing indicator, members panel
- **Message Bubbles**: Own (coral gradient) vs other (white/dark surface), reply context, edit/delete, delivery ticks (sent/delivered/read)
- **Emoji Reactions**: Inline reaction chips, emoji picker grid, optimistic updates via WebSocket
- **Message Input**: Auto-resize textarea, file upload, quick emoji tray, keyboard hints
- **Create Room Modal**: Group channel or DM, user search with chips
- **Room Settings Panel**: Edit info, manage members (promote/mute/remove), media gallery, danger zone
- **Profile Panel**: Edit name/username/bio, change password
- **Notification Center**: Dropdown with read/unread states, mark-all-read
- **Message Search**: Inline search bar with highlighted results

## Getting Started

```bash
npm install
npm run dev
```

Backend API expected at `/api/v1` (or `http://localhost:8080` in dev mode for OAuth2 + WebSocket).

## Project Evolution Track
- [x] Initial infrastructure and config
- [x] Static Assets and Public files
