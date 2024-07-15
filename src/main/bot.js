import { REST, Routes, Client, GatewayIntentBits, IntentsBitField } from 'discord.js';
import { EndBehaviorType, VoiceReceiver, joinVoiceChannel, VoiceConnectionStatus, createAudioResource, entersState, createAudioPlayer, getVoiceConnection } from '@discordjs/voice';
import fs from 'fs';
import request from 'request';
import { CONFIG } from '../config/config.js';
import { createWriteStream } from 'node:fs';
import prism from 'prism-media';
import { pipeline } from 'node:stream';

const USER_PATH = './users/'
const IS_DEBUG = true;
const AUDIO_FILES_NB = CONFIG.AUDIO_FILES_NB | 10;

let isTalking = false;
let channel = null;
let voiceConnection = null;
let audioPlayer = createAudioPlayer();
let dispatcher = null;
let guild = null;
let target = null;
let mimic = null;
let canMimic = false;
let onOff = true;
let areTalking = {};

const Commands = {
	'listen': {
		description: 'Mimic Bot will listen to the targeted user',
		options: [
            {
                type: 6,
                name: "mimic",
                description: "user to impersonate",
                required: true,
            }
        ],
		execute: async (interaction) => {
			target = interaction.options.getUser('mimic')
			mimic = interaction.options.getUser('mimic')
			guild = interaction.guildId;
			if(IS_DEBUG){console.log("Bot is now targeting user with id : " + target)}
			checkForUserInVoice();
			await interaction.reply('Will now listen to target')
		}
	},
	'pretend': {
		description: 'Mimic Bot will impersonate another user, and join another user',
		options: [
            {
                type: 6,
                name: "mimic",
                description: "user to impersonate",
                required: true,
            },
			{
                type: 6,
                name: "target",
                description: "user to join",
                required: true,
            }
        ],
		execute: async (interaction) => {
			target = interaction.options.getUser('target');
			mimic = interaction.options.getUser('mimic');
			guild = interaction.guildId;
			if(fs.existsSync(USER_PATH + mimic.id)){
				const filenames = fs.readdirSync(USER_PATH + mimic.id + '/recordings');
				if(filenames.length < AUDIO_FILES_NB){
					await interaction.reply('Not enough data to mimic user')
				}else{
					if(IS_DEBUG){console.log("Bot is now targeting user with id : " + target + " but mimicing user : " + mimic)}
					checkForUserInVoice();
					await interaction.reply('Now in pretend mode')
				}
			}
		}
	},
	'stop': {
		description: 'Turn Mimic Bot off.',
		execute: async (interaction) => {
			await interaction.reply('Leaving')
			if (voiceConnection) {
				voiceConnection.destroy();
				voiceConnection = null;
			}
			target = null;
			mimic = null;
			onOff = false;
		}
	},
};

let transformedCommands = Object.entries(Commands).map(([key, value]) => {
    return { name: key, description: value.description, options: value.options };
})

const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_TOKEN);

try {
    console.log('Started refreshing application (/) with these commands :');
    console.log(transformedCommands)
    await rest.put(Routes.applicationCommands(CONFIG.DISCORD_ID), { body: transformedCommands });
    console.log('Successfully reloaded application (/) commands.');
} catch (error) {
    console.error(error);
}

const myIntents = new IntentsBitField( 3276799 );
const client = new Client({ intents: [ myIntents ] });

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag} !`);
	if(IS_DEBUG && target){console.log("Bot is now targeting user with id : " + target)}
	if(target){checkForUserInVoice()};
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
	try{
        if (Commands[interaction.commandName]) {
            await Commands[interaction.commandName].execute(interaction);
        } else {
            await interaction.reply('Command not found !');
        }
    }catch(e){
        await interaction.reply(e);
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
	if (oldState && newState && oldState.id === target.id && newState.id === target.id && onOff) {
		if(IS_DEBUG){console.log("Target entered a voice channel")}
		if (oldState.channelId === null) {
			if(IS_DEBUG){console.log("Bot is trying to join the channel")}
			channel = await client.channels.fetch(newState.channelId);
			joinVoiceChan(channel);
		}
		if (oldState.channelId != null && newState.channel === null && voiceConnection != null) {
			voiceConnection.destroy();
			voiceConnection = null;
		}
		if (oldState.channelId != null && newState.channel != null) {
			if(IS_DEBUG){console.log("Bot is trying to join the channel")}
			channel = await client.channels.fetch(newState.channelId);
			joinVoiceChan(channel);
		}
	}
});

client.login(CONFIG.DISCORD_TOKEN);

// UTILS

const bindDonny = (receiver) => {
	receiver.speaking.on('start', (userId) => {
		if(mimic){
			const filenames = fs.readdirSync(USER_PATH + mimic.id + '/recordings');
			// If the user to mimic is speaking and has less audio file than set, then record more
			if(userId === mimic.id && !isTalking && filenames.length < AUDIO_FILES_NB){
				if(IS_DEBUG){console.log("Trying to record")}
				createListeningStream(receiver, userId, client.users.cache.get(userId));
				
				// When wasn't able to mimic, just can now, re-connect to VC
				if(filenames.length == AUDIO_FILES_NB - 1){
					canMimic = true;
					checkForUserInVoice();
				}
			}			
			// If someone else is speaking and bot have at least the good amount of audio + 1/2 to talk
			if(userId !== mimic.id && filenames.length >= AUDIO_FILES_NB && Math.random() > 0.5){
				audioPlayer.pause();
				if(IS_DEBUG){console.log("Other is talking")}			
				const randomVal = Math.floor(Math.random() * filenames.length);
				if(IS_DEBUG){console.log("Picked file " + filenames[randomVal])}
				let resource = createAudioResource(USER_PATH + mimic.id + '/recordings/' + filenames[randomVal]);
				audioPlayer.play(resource);
			}
		}else{
			if(!areTalking[userId]){
				areTalking[userId] = true;
				
				if(IS_DEBUG){console.log("Trying to record")}
				createListeningStream(receiver, userId, client.users.cache.get(userId));
			}
		}
	});
	receiver.speaking.on('end', (userId) => {
		if(mimic){
			if(userId === target.id && isTalking){
				if(IS_DEBUG){console.log("Target stopped talking")}
				isTalking = false;
			}
		}else{
			areTalking[userId] = false;
		}
	});
}

const mimicUser = (userId) => {
	client.guilds.cache.get(guild).members.fetch().then( members => {
		let member = members.get(userId);
		let bot = members.get(client.user.id);
		if(member){
			if(IS_DEBUG){console.log("Mimicing target")}
			const user = member.user;
			if(!fs.existsSync(USER_PATH + user.id)){
				if(IS_DEBUG){console.log("First time mimicing this user")}
				fs.mkdirSync(USER_PATH + user.id, {'recursive' : true});
			}
			const avatarPath = USER_PATH + user.id + '/' + user.avatar + '.webp'
			if(!fs.existsSync(avatarPath)) {
				const dlPath = CONFIG.imgPath.replace('${userId}',user.id).replace('${avatar}',user.avatar);	
				if(IS_DEBUG){console.log("No avatar already downloaded, getting it from '" + dlPath + "' to '" + avatarPath + "'")}
				download(dlPath, avatarPath, function(){
					if(IS_DEBUG){console.log("Downloaded new avatar image")}
					client.user.setAvatar(avatarPath);
				});
			}else{
				client.user.setAvatar(avatarPath);
			}
			
			if(member.nickname){
				bot.setNickname(member.nickname).catch(e => {console.log('Error : ' + e);});
				client.user.setUsername(member.nickname + '᲼').catch(e => {console.log('Error : ' + e);});
			}else{
				bot.setNickname(user.username).catch(e => {console.log('Error : ' + e);});
				client.user.setUsername(user.username + '᲼').catch(e => {console.log('Error : ' + e);});
			}
		}
	});
}

const backDefault = () => {
	client.guilds.cache.get(guild).members.fetch().then( members => {
		let bot = members.get(client.user.id);
		const filenames = fs.readdirSync(USER_PATH + 'default');
		const randomVal = Math.floor(Math.random() * filenames.length);
		client.user.setUsername('Bot de Runeterra').catch(e => {console.log('Error : ' + e);});
		bot.setNickname('Bot de Runeterra').catch(e => {console.log('Error : ' + e);});
		client.user.setAvatar(USER_PATH + 'default/' + filenames[randomVal]);
	});
}

const joinVoiceChan = (channel) => {
    console.log("Joining Voice Channel")
    voiceConnection = getVoiceConnection(channel.guild.id);
    if (voiceConnection?.state?.status == VoiceConnectionStatus.Ready) return;
    if (voiceConnection) {
        voiceConnection.destroy();
        voiceConnection = null;
    }
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });
    voiceConnection = connection
    connection.on(VoiceConnectionStatus.Ready, (err) => {
        voiceConnection.subscribe(audioPlayer);
		bindDonny(voiceConnection.receiver)
    });
    connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
        try {
            console.log("Problems with connection")
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch (error) {
            console.log(error)
            connection.destroy();
        }
    });
}

// check if target is in voice and join and disconnect if voiceConnection is active
// but target is not in voice.
const checkForUserInVoice = () => {
	client.guilds.cache.get(guild).channels.fetch().then( channels => {
		let vcs = channels.filter(c => c.type === 2);
		for (const [key,value] of vcs) {
			if (value.members.has(target.id)) {
				channel = value;
				// If mimic user then do as before
				if(mimic.id){
					if(!fs.existsSync(USER_PATH + mimic.id + '/recordings')){
						fs.mkdirSync(USER_PATH + mimic.id + '/recordings', {'recursive' : true});
					}
					// If enough records already from target mimimc and join, else set it to back to default bot
					const filenames = fs.readdirSync(USER_PATH + mimic + '/recordings');
					if(filenames.length >= AUDIO_FILES_NB){
						canMimic = true;
						mimicUser(mimic.id);
					}else{
						canMimic = false;
						backDefault();
					}
				}else{
					backDefault();
					value.members.forEach(m => {
						if(IS_DEBUG){console.log("Found user " + m.user.username + " in channel")}
						if(!fs.existsSync(USER_PATH + m.user.id + '/recordings')){
							fs.mkdirSync(USER_PATH + m.user.id + '/recordings', {'recursive' : true});
						}
					})
				}
				joinVoiceChan(channel);
				return;
			}
		}
	});
}

const download = function(uri, filename, callback){
	request.head(uri, function(err, res, body){
		request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
	});
};

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