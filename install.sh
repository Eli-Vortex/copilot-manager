#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="copilot-manager"
SERVICE_PORT="${MANAGER_PORT:-3000}"
INSTALL_DIR="${INSTALL_DIR:-/opt/copilot-manager}"
GLOBAL_CMD="cmanager"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $*"; }

check_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || err "Please run as root: sudo $0 $*"
}

install_bun() {
  if command -v bun &>/dev/null; then
    log "Bun already installed: $(bun --version)"
    return
  fi
  info "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  log "Bun installed: $(bun --version)"
}

do_install() {
  check_root
  info "Installing Copilot Manager..."

  install_bun

  if [[ ! -d "${INSTALL_DIR}" ]]; then
    err "Project not found at ${INSTALL_DIR}. Clone it first:\n  git clone <repo-url> ${INSTALL_DIR}"
  fi

  cd "${INSTALL_DIR}"

  info "Installing dependencies..."
  bun install

  info "Building frontend..."
  bun run build

  info "Creating systemd service..."
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=Copilot Manager - GitHub Copilot API Management Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=$(command -v bun) server/main.ts
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=MANAGER_PORT=${SERVICE_PORT}
Environment=PATH=$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}"

  ln -sfn "${INSTALL_DIR}/copilot-manager.sh" "/usr/local/bin/${GLOBAL_CMD}"

  cat > "${INSTALL_DIR}/copilot-manager.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="copilot-manager"
INSTALL_DIR="/opt/copilot-manager"

case "${1:-help}" in
  start)   systemctl start "$SERVICE_NAME" && echo "Started" ;;
  stop)    systemctl stop "$SERVICE_NAME" && echo "Stopped" ;;
  restart) systemctl restart "$SERVICE_NAME" && echo "Restarted" ;;
  status)  systemctl status "$SERVICE_NAME" --no-pager ;;
  logs)    journalctl -u "$SERVICE_NAME" -n "${2:-200}" --no-pager ;;
  update)
    cd "$INSTALL_DIR"
    echo "Pulling latest code..."
    git pull
    echo "Installing dependencies..."
    bun install
    echo "Building..."
    bun run build
    echo "Restarting service..."
    systemctl restart "$SERVICE_NAME"
    echo "Update complete!"
    ;;
  uninstall)
    systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload
    rm -f "/usr/local/bin/cmanager"
    echo "Uninstalled. Project files remain at $INSTALL_DIR"
    ;;
  *)
    echo "Copilot Manager CLI"
    echo ""
    echo "Usage: cmanager <command>"
    echo ""
    echo "Commands:"
    echo "  start       Start the service"
    echo "  stop        Stop the service"
    echo "  restart     Restart the service"
    echo "  status      Show service status"
    echo "  logs [N]    Show last N lines of logs (default 200)"
    echo "  update      Pull latest code, rebuild, and restart"
    echo "  uninstall   Remove systemd service"
    ;;
esac
SCRIPT
  chmod +x "${INSTALL_DIR}/copilot-manager.sh"
  ln -sfn "${INSTALL_DIR}/copilot-manager.sh" "/usr/local/bin/${GLOBAL_CMD}"

  systemctl start "${SERVICE_NAME}"

  echo ""
  log "Installation complete!"
  echo ""
  info "Dashboard:  http://0.0.0.0:${SERVICE_PORT}"
  info "CLI:        cmanager start|stop|restart|status|logs|update|uninstall"
  echo ""
}

do_uninstall() {
  check_root
  systemctl disable --now "${SERVICE_NAME}" 2>/dev/null || true
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  rm -f "/usr/local/bin/${GLOBAL_CMD}"
  log "Uninstalled service and CLI command"
}

case "${1:-help}" in
  install)   do_install ;;
  uninstall) do_uninstall ;;
  *)
    echo "Usage: $0 install|uninstall"
    echo ""
    echo "  install     Install as systemd service + create 'cmanager' command"
    echo "  uninstall   Remove systemd service"
    ;;
esac
