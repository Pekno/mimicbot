FROM node:22
ENV DISCORD_TOKEN=$DISCORD_TOKEN
ENV DISCORD_ID=$DISCORD_ID
ENV AUDIO_FILES_NB=$AUDIO_FILES_NB
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
CMD [ "node", "./src/main/bot.js" ]