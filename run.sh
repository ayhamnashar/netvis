set -e

NETSPOC="${1:?Usage: $0 /path/to/netspoc}"
NETSPOC=$(realpath "$NETSPOC")

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../data"

# --- Node.js via nvm ---
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "Installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
\. "$NVM_DIR/nvm.sh"
if ! command -v node &>/dev/null; then
    echo "Installing Node.js LTS..."
    nvm install --lts
fi

# --- Install frontend deps ---
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install --legacy-peer-deps
fi

# --- Generate objects.json ---
mkdir -p "$DATA_DIR"
echo "Exporting topology data..."

"$HOME/go/bin/export-netvis" -q "$NETSPOC" 2>/dev/null > "$DATA_DIR/objects.json" || true

# --- Start backend ---
echo "Starting backend on localhost:5043..."
VISDATA="$DATA_DIR" VISSPOC="$NETSPOC" LISTENPORT=5043 LISTENADDRESS=localhost \
    go run "$SCRIPT_DIR/backend/backend.go" &
BACKEND_PID=$!

# Wait for backend to be ready
for i in $(seq 1 10); do
    curl -sf http://localhost:5043/get?id=network:INTERNET > /dev/null 2>&1 && break
    sleep 1
done

# --- Start frontend ---
echo "Starting frontend at http://localhost:5173 ..."
trap "kill $BACKEND_PID 2>/dev/null" EXIT
VITE_BACKEND_PORT=5043 npm run dev
