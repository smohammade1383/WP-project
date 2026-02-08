#!/bin/bash

# Startup script for WP-Project
# This will start both backend and frontend

echo "🚀 Starting WP-Project..."
echo ""

# Start Docker Compose
echo "📦 Starting Database and Backend..."
docker-compose up -d db web

# Wait for backend to be ready
echo "⏳ Waiting for backend to be ready..."
until curl -s http://localhost:8000/api/people/stats/ > /dev/null 2>&1; do
    sleep 1
done

echo "✅ Backend is ready!"
echo ""

# Start frontend
echo "🎨 Starting Frontend..."
cd frontend && npm run dev
