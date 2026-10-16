#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "=================================================================="
echo "   🚀 STARTING ADVANCE ASSISTANT OS v6.0 WEB DASHBOARD SUITE     "
echo "=================================================================="

# 1. Activate Python Virtual Environment
if [ -d "$PROJECT_ROOT/venv" ]; then
    source "$PROJECT_ROOT/venv/bin/activate"
    echo "✅ Python virtual environment activated."
fi

# 2. Process Cleanup Trap
cleanup() {
    echo ""
    echo "🛑 Shutting down services cleanly..."
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    echo "✅ All services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 3. Launch Backend Bridge
echo "📡 Launching FastAPI Web Bridge on http://0.0.0.0:8000..."
python3 -m uvicorn src.server:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

sleep 1.5

# 4. Launch Frontend Vite Server using Linux Node
echo "💻 Launching Vite React Dashboard on http://0.0.0.0:5173..."
cd "$PROJECT_ROOT/frontend"

# Call Vite's JS entrypoint directly with Linux node
node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173 &
FRONTEND_PID=$!

cd "$PROJECT_ROOT"

echo ""
echo "=================================================================="
echo " 🎉 DASHBOARD SERVICES RUNNING CONCURRENTLY"
echo "=================================================================="
echo " • Web Dashboard (Windows Chrome):   http://localhost:5173"
echo " • Backend API & Swagger Docs:       http://localhost:8000/docs"
echo " • WebSocket Telemetry Stream:       ws://localhost:8000/ws/telemetry"
echo " • Native CLI (Untouched):           python3 src/main.py"
echo "=================================================================="
echo " Press Ctrl+C at any time to shut down both services."
echo ""

wait
