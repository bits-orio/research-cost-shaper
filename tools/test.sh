#!/usr/bin/env bash
# Runs the Lua tests (on Lua 5.2 via lupa) and the JS tests.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m unittest discover tests
node --test tests/*.test.js
