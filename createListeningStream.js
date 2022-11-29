import { EndBehaviorType, VoiceReceiver } from '@discordjs/voice';
import { User } from 'discord.js';
import { createWriteStream } from 'node:fs';
import prism from 'prism-media';
import { pipeline } from 'node:stream';
import fs from 'fs';

function getDisplayName(userId, user) {
	return user ? `${user.username}_${user.discriminator}` : userId;
}

export function createListeningStream(receiver, userId, user) {
	const opusStream = receiver.subscribe(userId, {
		end: {
			behavior: EndBehaviorType.AfterSilence,
			duration: 100,
		},
	});

	const oggStream = new prism.opus.OggLogicalBitstream({
		opusHead: new prism.opus.OpusHead({
			channelCount: 2,
			sampleRate: 48000,
		}),
		pageSizeControl: {
			maxPackets: 10,
		},
	});


	const filename = `./users/${userId}/recordings/`;
	if (!fs.existsSync(filename)){
		fs.mkdirSync(filename, {'recursive' : true});
	}
	
	const out = createWriteStream(filename + '/' + Date.now() + '.ogg');

	console.log(`Started recording ${filename}`);

	pipeline(opusStream, oggStream, out, (err) => {
		if (err) {
			console.warn(`Error recording file ${filename} - ${err.message}`);
		} else {
			console.log(`Recorded ${filename}`);
		}
	});
}