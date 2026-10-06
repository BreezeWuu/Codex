#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 22 or newer from https://nodejs.org/ and try again.'
  read -r -p 'Press Enter to close.'
  exit 1
fi
if [ ! -f .env ]; then
  cp .env.ark.example .env
  open -e .env
  echo 'Fill ARK_API_KEY in .env and save. Never share the key.'
  read -r -p 'Press Enter after saving.'
fi
echo 'Open http://localhost:3000 after startup. Keep this terminal open.'
npm start
