#!/bin/bash
# MyClaw 本地开发启动脚本

SSH_KEY="$HOME/.ssh/lightsail/mykey"
REMOTE="ubuntu@54.202.132.115"

echo "🔌 开启数据库隧道..."
ssh -i "$SSH_KEY" -L 5433:localhost:5432 "$REMOTE" -N -o ServerAliveInterval=30 &
TUNNEL_PID=$!
echo "   隧道 PID: $TUNNEL_PID"

# 等隧道就绪
sleep 2

echo "🚀 启动 API (port 2222)..."
cd "$(dirname "$0")"
pnpm --filter api dev &
API_PID=$!

echo "🌐 启动 Web (port 1111)..."
pnpm --filter web dev &
WEB_PID=$!

echo ""
echo "✅ 全部启动完毕"
echo "   API:  http://localhost:2222"
echo "   Web:  http://localhost:1111"
echo ""
echo "按 Ctrl+C 停止所有服务..."

# Ctrl+C 时清理所有进程
trap "echo '停止中...'; kill $TUNNEL_PID $API_PID $WEB_PID 2>/dev/null; exit" INT TERM
wait
