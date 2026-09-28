#!/usr/bin/env bash
# Drive the client started by run-gui.sh. Coordinates are window-relative.
#   gui-drive.sh shot <out.png>            screenshot the game window only
#   gui-drive.sh move <x> <y>              move the mouse
#   gui-drive.sh click <x> <y> [button]    click (1 left, 3 right)
#   gui-drive.sh drag <x1> <y1> <x2> <y2>  left-drag
#   gui-drive.sh key <keys...>             e.g. alt+p, Escape, e
#   gui-drive.sh type <text>
#   gui-drive.sh stop                      quit the client
set -uo pipefail
RUN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.run/gui"
PID=$(cat "$RUN/pid")
# The first window a fresh client reports can be a short-lived splash that
# is already gone; take the one that still answers with a Factorio title.
W=""
for id in $(xdotool search --pid "$PID" 2>/dev/null); do
  case "$(xdotool getwindowname "$id" 2>/dev/null)" in Factorio*) W=$id ;; esac
done
[ -n "$W" ] || { echo "client window not found"; exit 1; }
focus() { xdotool windowactivate --sync "$W" 2>/dev/null || { xdotool windowraise "$W"; xdotool windowfocus --sync "$W"; }; sleep 0.3; }
cmd="$1"; shift
case "$cmd" in
  shot)  focus; import -window "$W" "$1" ;;
  move)  focus; xdotool mousemove --window "$W" "$1" "$2" ;;
  click) focus; xdotool mousemove --window "$W" "$1" "$2"; sleep 0.2; xdotool click "${3:-1}" ;;
  drag)  focus; xdotool mousemove --window "$W" "$1" "$2" mousedown 1; sleep 0.2
         xdotool mousemove --window "$W" "$3" "$4"; sleep 0.2; xdotool mouseup 1 ;;
  key)   focus; for k in "$@"; do xdotool key --window "$W" "$k"; sleep 0.2; done ;;
  type)  focus; xdotool type --delay 60 "$1" ;;
  stop)  kill "$PID" 2>/dev/null; ps -C factorio -o pid=,args= | grep "/.run/gui/" | awk '{print $1}' | xargs -r kill ;;
esac
