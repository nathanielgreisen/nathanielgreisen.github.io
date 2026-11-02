#!/usr/bin/env bash
set -euo pipefail
python manage.py migrate --noinput
python manage.py seed_canvas
python manage.py bootstrap_admin
exec daphne -b 0.0.0.0 -p "${PORT:-8000}" config.asgi:application
