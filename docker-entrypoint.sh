#!/bin/sh
cp /app/static-data/*.json /app/data/
exec "$@"
