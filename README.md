# Mimic Bot

<div align="center">
  
[![Docker pulls](https://img.shields.io/docker/pulls/pekno/mimicbot)](https://hub.docker.com/r/pekno/mimicbot)
  
</div>

## Description

Mimic Bot is a Discord bot designed to impersonate a targeted user by recording their voice and replaying audio files to mimic their speech. The bot starts recording the targeted user and, once it has collected enough audio files, can impersonate and act as the user during conversations.

## Commands

| Command  | Description                                                                                  | Options                                                                                                                                                      |
|----------|----------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `listen` | Mimic Bot will listen to the targeted user.                                                  | - `mimic` (type: user, required: true): The user to impersonate.                                                                                              |
| `pretend`| Mimic Bot will impersonate another user and join another user.                               | - `mimic` (type: user, required: true): The user to impersonate. <br> - `target` (type: user, required: true): The user to join.                             |
| `stop`   | Turn Mimic Bot off.                                                                          | None                                                                                                                                                         |

## Setup

To configure Mimic Bot, you need to set the following environment variables:

1. **Required Environment Variables:**
   - `DISCORD_ID`: Your Discord application ID.
   - `DISCORD_TOKEN`: Your Discord bot token.

2. **Optional Environment Variable:**
   - `AUDIO_FILES_NB`: Defines the number of audio files to record for a user before the bot can impersonate them. Default is 10. 

A Docker image is also available via [Docker Hub](https://hub.docker.com/r/pekno/mimicbot).
