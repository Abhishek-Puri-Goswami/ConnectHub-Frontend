# ConnectHub - Real-Time Chat Frontend

## Overview
ConnectHub is a modern, real-time chat application interface built with React and Vite. It features a sophisticated Claymorphism design system for a unique and tactile user experience.

## Design System
- **Theme**: Claymorphism, characterized by soft shadows, rounded surfaces, inset interactive elements, and vibrant gradients.
- **Color Palette**:
    - Coral: `#FF8E72` (Primary actions)
    - Mint: `#7AC9A7` (Success states)
    - Lavender: `#B8A4F4` (Secondary elements)
    - Cream: `#FDF6EC` (Background surfaces)
    - Plum: `#1A1625` (Contrast surfaces)
- **Typography**: Plus Jakarta Sans for primary interface text and JetBrains Mono for technical content.
- **Responsiveness**: Fully responsive layout adapts to all device sizes, with a dedicated drawer-style sidebar for mobile and tablet views.
- **Modes**: Support for light and dark modes via a system-aware `data-theme` attribute.

## Feature Highlights

### Authentication & Identification
- **Structured Registration**: Requirement-driven input with live validation.
- **Multichannel Verification**: Integrated email and SMS OTP validation flows.
- **Secure Access**: Choice of conventional credentials, OTP-based login, or OAuth2 providers (Google & GitHub).

### Messaging & Interaction
- **Real-time Communication**: Optimistic UI updates with WebSocket integration.
- **Rich Interaction**: Emoji reactions, message replies, and delivery status indicators (Sent, Delivered, Read).
- **Media Management**: Support for file uploads and an integrated media gallery.
- **Group Management**: Comprehensive room settings for managing members, roles, and privacy.

## Getting Started

### Prerequisites
- Node.js (Latest LTS recommended)
- Connected Backend API at `http://localhost:8080/api/v1`

### Installation
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Project Evolution Track
- [x] Initial Project Infrastructure and Config
- [x] Static Assets and Public Folder Setup
- [x] State Management (Zustand) and API Client Layer
- [x] UI Component Library and Theme Implementation
- [x] Real-time Integration via WebSockets
