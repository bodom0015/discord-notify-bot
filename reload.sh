#!/bin/bash

# Remove existing bot container
docker rm -f dispatch-notify-bot

# Rebuild bot Docker image
docker build -t dispatch-notify-bot . 

# Run a new container from bot Docker image
docker run -it --link=dispatch-mongo --name=dispatch-notify-bot --restart=Always dispatch-notify-bot
