# AI Expense Tracker (Axis/IDFC Focused)

A premium, glassmorphic expense tracker that automatically parses bank alerts (Axis/IDFC/UPI) from your Gmail.

## Tech Stack
- **Frontend**: React + Vite + Recharts + Framer Motion (Vercel)
- **Backend**: Node.js + Express (Render)
- **Database**: Firebase Firestore
- **Auth**: Firebase Google Login
- **Scanner**: Google Gmail API

## Setup Instructions

### 1. Firebase Setup
1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/).
2. Enable **Firestore Database** and **Google Authentication**.
3. Go to Project Settings > Service Accounts and generate a new private key.
4. Rename it to `serviceAccountKey.json` and place it in `backend/config/`.

### 2. Google Cloud (for Gmail)
1. Enable Gmail API in your Google Cloud Console.
2. Create OAuth 2.0 Credentials.
3. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `backend/.env`.

### 3. Frontend Configuration
1. Grab your Firebase Web Config from the Firebase Console.
2. Update `frontend/src/firebase.js` with your credentials.

### 4. Running Locally
```bash
# Backend
cd backend
npm install
node server.js

# Frontend
cd frontend
npm install
npm run dev
```

## Features
- **Smart Parsing**: Automatically detects "Axis Bank", "IDFC Credit Card", and "UPI" transactions.
- **Income vs Expense**: Smart classification of "credited" vs "debited" alerts.
- **Period Filtering**: View stats by Week, Month (Jan-Dec), or Year.
- **Premium Design**: Full glassmorphism and modern charts.
