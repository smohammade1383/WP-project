#!/bin/bash
set -euo pipefail

# Local development startup script
# Runs backend and frontend without Docker

PROJECT_ROOT="/Users/wishuwerehere/Documents/daneshgah/term5/WEB/project/WP-project"

echo "🚀 Starting WP-Project (Local Development Mode)"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    local pids
    pids="$(jobs -p || true)"
    if [ -n "${pids}" ]; then
        kill ${pids} 2>/dev/null || true
    fi
    exit
}

trap cleanup SIGINT SIGTERM

# Start backend
echo "🐍 Starting Django Backend on port 8000..."
cd "${PROJECT_ROOT}"

if [ -n "${VIRTUAL_ENV:-}" ]; then
    echo "✅ Using already active virtualenv: ${VIRTUAL_ENV}"
elif [ -n "${CONDA_PREFIX:-}" ]; then
    echo "✅ Using active conda environment: ${CONDA_PREFIX}"
elif [ -f "venv/bin/activate" ]; then
    echo "✅ Activating project venv: ${PROJECT_ROOT}/venv"
    # shellcheck disable=SC1091
    source venv/bin/activate
elif [ -f ".venv/bin/activate" ]; then
    echo "✅ Activating project venv: ${PROJECT_ROOT}/.venv"
    # shellcheck disable=SC1091
    source .venv/bin/activate
else
    echo "❌ No usable virtualenv found."
    echo "   Checked: active \$VIRTUAL_ENV, ${PROJECT_ROOT}/venv, ${PROJECT_ROOT}/.venv"
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
