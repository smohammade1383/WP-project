#!/bin/bash

# Local development startup script
# Runs backend and frontend without Docker

PROJECT_ROOT="/Users/mahbod/Documents/GitHub/WP-project"

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
cd "$PROJECT_ROOT"
source .venv/bin/activate
echo "🔧 Running database migrations..."
python manage.py migrate --noinput
python manage.py runserver &
BACKEND_PID=$!

# Wait for backend
echo "⏳ Waiting for backend to start..."
sleep 3

# Start frontend
echo "⚛️  Starting React Frontend on port 5173..."
cd "$PROJECT_ROOT/frontend"
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
V, ${PROJECT_ROOT}/venv, ${PROJECT_ROOT}/.venv"
    echo "   اول محیط مجازی را بساز/وصل کن و دوباره اسکریپت را اجرا کن."
    exit 1
fi

if ! python -c "import django, dotenv" >/dev/null 2>&1; then
    echo "❌ Current Python environment misses required packages (django/python-dotenv)."
    echo "   Run: pip install -r requirements.txt"
    exit 1
fi

echo "🔧 Running database migrations..."
python manage.py migrate --noinput
if ! python manage.py showmigrations cases | grep -q "\[X\] 0009_boardlink_connection_points"; then
    echo "❌ Required migration 0009_boardlink_connection_points is not applied."
    echo "   لطفاً migration را بررسی کن و دوباره اجرا کن."
    exit 1
fi
if ! python manage.py showmigrations cases | grep -q "\[X\] 0010_case_acceptance_assignments"; then
    echo "❌ Required migration 0010_case_acceptance_assignments is not applied."
    echo "   لطفاً migration را بررسی کن و دوباره اجرا کن."
    exit 1
fi
python manage.py runserver &
BACKEND_PID=$!

# Wait for backend
echo "⏳ Waiting for backend to start..."
sleep 3

# Start frontend
echo "⚛️  Starting React Frontend on port 5173..."
cd "${PROJECT_ROOT}/frontend"
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
