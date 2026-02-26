#!/usr/bin/env bash

set -euo pipefail

# Local development startup script
# Runs backend and frontend without Docker

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starting WP-Project (Local Development Mode)"
echo ""

cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    pids="$(jobs -p)"
    if [[ -n "${pids}" ]]; then
        kill ${pids} 2>/dev/null || true
    fi
    exit 0
}

trap cleanup SIGINT SIGTERM

cd "$PROJECT_ROOT"

if [[ -f "${PROJECT_ROOT}/.venv/bin/activate" ]]; then
    source "${PROJECT_ROOT}/.venv/bin/activate"
elif [[ -f "${PROJECT_ROOT}/venv/bin/activate" ]]; then
    source "${PROJECT_ROOT}/venv/bin/activate"
else
    echo "❌ Python virtualenv not found (.venv or venv)."
    echo "   اول محیط مجازی را بساز/وصل کن و دوباره اسکریپت را اجرا کن."
    exit 1
fi

if ! python -c "import django, dotenv" >/dev/null 2>&1; then
    echo "❌ Current Python environment misses required packages (django/python-dotenv)."
    echo "   Run: pip install -r requirements.txt"
    exit 1
fi

echo "🐍 Starting Django Backend on port 8000..."
echo "🔧 Running database migrations..."
python manage.py migrate --noinput
python manage.py runserver &

echo "⏳ Waiting for backend to start..."
sleep 3

echo "⚛️  Starting React Frontend on port 5173..."
cd "${PROJECT_ROOT}/frontend"

if ! npm run | grep -q -E "^[[:space:]]+dev$|^[[:space:]]+dev[[:space:]]"; then
    echo "❌ Script 'dev' not found in frontend/package.json"
    echo "   Available scripts:"
    npm run
    exit 1
fi

npm run dev &

echo ""
echo "✅ Services started!"
echo "   📱 Frontend: http://localhost:5173"
echo "   🔧 Backend:  http://localhost:8000"
echo "   📚 API Docs: http://localhost:8000/api/docs/"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

wait
