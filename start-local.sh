#!/bin/bash

# Local development startup script
# Runs backend and frontend without Docker

echo "🚀 Starting WP-Project (Local Development Mode)"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $(jobs -p) 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

# Start backend
echo "🐍 Starting Django Backend on port 8000..."
cd /Users/mahbod/Documents/GitHub/WP-project
python manage.py runserver &
BACKEND_PID=$!

# Wait for backend
echo "⏳ Waiting for backend to start..."
sleep 3

# Start frontend
echo "⚛️  Starting React Frontend on port 5173..."
cd /Users/mahbod/Documents/GitHub/WP-project/frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Services started!"
echo "   📱 Frontend: http://localhost:5173"
echo "   🔧 Backend:  http://localhost:8000"
echo "   📚 API Docs: http://localhost:8000/api/docs/"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for processes
wait
