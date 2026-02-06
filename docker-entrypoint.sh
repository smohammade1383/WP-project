#!/bin/sh
set -e

if [ "${DB_ENGINE}" = "postgres" ]; then
  echo "Waiting for PostgreSQL..."
  until python - <<'PY'
import os
import psycopg2

conn = psycopg2.connect(
    dbname=os.getenv("DB_NAME", "wp_project"),
    user=os.getenv("DB_USER", "wp_project"),
    password=os.getenv("DB_PASSWORD", "wp_project"),
    host=os.getenv("DB_HOST", "db"),
    port=os.getenv("DB_PORT", "5432"),
)
conn.close()
PY
  do
    sleep 1
  done
fi

python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py runserver 0.0.0.0:8000
