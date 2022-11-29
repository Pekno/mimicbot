import Discord, { IntentsBitField } from 'discord.js';
import { joinVoiceChannel, VoiceConnectionStatus, createAudioResource, createAudioPlayer } from '@discordjs/voice';
import { createListeningStream } from './createListeningStream.js';
import fs from 'fs';
import request from 'request';
import { conf } from './conf.js';

const myIntents = new IntentsBitField( 3276799 );
const Client = new Discord.Client({ intents: [ myIntents ] });


const IS_DEBUG = true;
const AUDIO_FILES_NB = 10;

// bot command prefix
const prefix = '!bot ';

let isTalking = false;
let channel = null;
let voiceConnection = null;
let voicePlayer = createAudioPlayer();
let dispatcher = null;
let guild = null;
let target = null;
let mimic = null;
let canMimic = false;
let onOff = true;
let areTalking = {};

const Commands = {
	'test': {
		help: 'Listen in channel',
		execute: async (message) => {
			target = message.author.id;
			guild = message.guildId;
			if(IS_DEBUG){console.log("Bot is now targeting user with id : " + target)}
			checkForUserInVoice();
		}
	},
	'mimic': {
		help: 'Set the person that Donnie will target. Usage: don!target @ElizaThornberry . Must @ (mention) a valid user. THIS MUST BE A VALID USER, MEANING THE NAME MUST BE HIGHLIGHTED BLUE INDICATING YOU ARE MENTIONING A USER.',
		execute: async (message) => {
			if (message.mentions.users.size < 1) {
				message.reply('Must mention a valid user.');
			} else {
				const mentions = [...message.mentions.users.values()]
				target = mentions[0].id;
				mimic = mentions[0].id;
				guild = message.guildId;
				if(IS_DEBUG){console.log("Bot is now targeting user with id : " + target)}
				checkForUserInVoice();
				if (!target) {
					message.reply('Please provide a valid user.')
				}
			}
		}
	},
	'pretend': {
		help: 'Pretend to be another user',
		execute: async (message) => {
			if (message.mentions.users.size < 2) {
				message.reply('Must mention a valid users.');
			} else {
				const mentions = [...message.mentions.users.values()]
				target = mentions[1].id;
				mimic = mentions[0].id;
				guild = message.guildId;
				if(fs.existsSync('./users/' + mimic)){
					const filenames = fs.readdirSync('./users/' + mimic + '/recordings');
					if(filenames.length < AUDIO_FILES_NB){
						message.reply('Not enough data to mimic user')
					}else{
						if(IS_DEBUG){console.log("Bot is now targeting user with id : " + target + " but mimicing user : " + mimic)}
							checkForUserInVoice();
						if (!target) {
							message.reply('Please provide a valid user.')
						}
					}
				}
			}
		}
	},
	'stop': {
		help: 'Turn Donnie off.',
		execute: (message) => {
			if (voiceConnection) {
				voiceConnection.destroy();
				voiceConnection = null;
			}
			target = null;
			mimic = null;
			onOff = false;
		}
	},
	'start': {
		help: 'Turn Donnie on. ;)',
		execute: (message) => {
			guild = message.guildId;
			onOff = true;
			checkForUserInVoice();
		}
	},
	'help': {
		help: 'List commands for donnie.',
		execute: (message) => {
			let helpMessage = new Discord.EmbedBuilder()
			.setTitle('Donnie Bot Help');
	let fields = [];
	for (key in Commands) {
		fields.push({name : `${prefix}${key}`, value: Commands[key].help});
	}
helpMessage.addFields(fields);
			message.reply({embeds: [helpMessage]});
		}
	}
}

// Client ready up handler
Client.on('ready', () => {
	console.log('Ready !');
	if(IS_DEBUG){console.log("Is bot on ? : " + onOff)}
	if(IS_DEBUG && target){console.log("Bot is now targeting user with id : " + target)}
	if(target){checkForUserInVoice()};
});

// Message handler, did this and the commands in a hurry just to 
// make it simpler to use for non programming people.
Client.on('messageCreate', (message) => {
	let content = message.content;
	if(IS_DEBUG){console.log("Emited message \"" + content + "\"")}
	if (content.startsWith(prefix)) {
		let cmd = content.substr(prefix.length).split(' ')[0];
		if(IS_DEBUG){console.log("Requested command is : " + cmd)}
		if (Commands[cmd]) {
			Commands[cmd].execute(message);
		} else {
			message.reply('Command not found, use "don!help" to see commands.');
		}
	}
});

// When user in guild joins a voice channel, check if it is
// the target and if so join the channel with the target. Likewise
// if the target leaves the voice channel so will the bot.
Client.on('voiceStateUpdate', async (oldState, newState) => {
	if (oldState.id === target && newState.id === target && onOff) {
		if(IS_DEBUG){console.log("Target entered a voice channel")}
		if (oldState.channelId === null) {
			if(IS_DEBUG){console.log("Bot is trying to join the channel")}
			channel = await Client.channels.fetch(newState.channelId);
			joinVC(channel);
		}
		if (oldState.channelId != null && newState.channel === null && voiceConnection != null) {
			voiceConnection.destroy();
			voiceConnection = null;
		}
		if (oldState.channelId != null && newState.channel != null) {
			if(IS_DEBUG){console.log("Bot is trying to join the channel")}
			channel = await Client.channels.fetch(newState.channelId);
			joinVC(channel);
		}
	}
});

const bindDonny = (receiver) => {
	receiver.speaking.on('start', (userId) => {
		if(mimic){
			const filenames = fs.readdirSync('./users/' + mimic + '/recordings');
			// If the user to mimic is speaking and has less audio file than set, then record more
			if(userId === mimic && !isTalking && filenames.length < AUDIO_FILES_NB){
				if(IS_DEBUG){console.log("Trying to record")}
				createListeningStream(receiver, userId, Client.users.cache.get(userId));
				
				// When wasn't able to mimic, just can now, re-connect to VC
				if(filenames.length == AUDIO_FILES_NB - 1){
					canMimic = true;
					checkForUserInVoice();
				}
			}			
			// If someone else is speaking and bot have at least the good amount of audio + 1/2 to talk
			if(userId !== mimic && filenames.length >= AUDIO_FILES_NB && Math.random() > 0.5){
				voicePlayer.pause();
				if(IS_DEBUG){console.log("Other is talking")}			
				const randomVal = Math.floor(Math.random() * filenames.length);
				if(IS_DEBUG){console.log("Picked file " + filenames[randomVal])}
				let resource = createAudioResource('./users/' + mimic + '/recordings/' + filenames[randomVal]);
				voicePlayer.play(resource);
			}
		}else{
			if(!areTalking[userId]){
				areTalking[userId] = true;

				if(IS_DEBUG){console.log("Trying to record")}
				createListeningStream(receiver, userId, Client.users.cache.get(userId));
			}
		}
	});
	receiver.speaking.on('end', (userId) => {
		if(mimic){
			if(userId === target && isTalking){
				if(IS_DEBUG){console.log("Target stopped talking")}
				isTalking = false;
			}
		}else{
			areTalking[userId] = false;
		}
	});
}

const mimicUser = (userId) => {
	Client.guilds.cache.get(guild).members.fetch().then( members => {
		let member = members.get(userId);
		let bot = members.get(Client.user.id);
		if(member){
			if(IS_DEBUG){console.log("Mimicing target")}
			const user = member.user;
			if(!fs.existsSync('./users/' + user.id)){
				if(IS_DEBUG){console.log("First time mimicing this user")}
				fs.mkdirSync('./users/' + user.id, {'recursive' : true});
			}
			const avatarPath = './users/' + user.id + '/' + user.avatar + '.webp'
			if(!fs.existsSync(avatarPath)) {
				const dlPath = conf.imgPath.replace('${userId}',user.id).replace('${avatar}',user.avatar);	
				if(IS_DEBUG){console.log("No avatar already downloaded, getting it from '" + dlPath + "' to '" + avatarPath + "'")}
				download(dlPath, avatarPath, function(){
					if(IS_DEBUG){console.log("Downloaded new avatar image")}
					Client.user.setAvatar(avatarPath);
				});
			}else{
				Client.user.setAvatar(avatarPath);
			}
			
			if(member.nickname){
				bot.setNickname(member.nickname).catch(e => {console.log('Error : ' + e);});
				Client.user.setUsername(member.nickname + '᲼').catch(e => {console.log('Error : ' + e);});
			}else{
				bot.setNickname(user.username).catch(e => {console.log('Error : ' + e);});
				Client.user.setUsername(user.username + '᲼').catch(e => {console.log('Error : ' + e);});
			}

			
									
			return
		}
	});
}

const backDefault = () => {
	Client.guilds.cache.get(guild).members.fetch().then( members => {
		let bot = members.get(Client.user.id);
		const filenames = fs.readdirSync('./users/default');
		const randomVal = Math.floor(Math.random() * filenames.length);
		Client.user.setUsername('Bot de Runeterra').catch(e => {console.log('Error : ' + e);});
		bot.setNickname('Bot de Runeterra').catch(e => {console.log('Error : ' + e);});
		Client.user.setAvatar('./users/default/' + filenames[randomVal]);
	});
}

const joinVC = (channel) => {
	if (voiceConnection) {
		voiceConnection.destroy();
		voiceConnection = null;
	}
	const connection = joinVoiceChannel({
		channelId: channel.id,
		guildId: channel.guild.id,
		adapterCreator: channel.guild.voiceAdapterCreator,
		selfDeaf: false
	});
	connection.on(VoiceConnectionStatus.Ready, () => {
		if(IS_DEBUG){console.log("Bot as joined the channel")}
		voiceConnection = connection;
		voiceConnection.subscribe(voicePlayer); 
						
		bindDonny(voiceConnection.receiver)
	});
}

// check if target is in voice and join and disconnect if voiceConnection is active
// but target is not in voice.
const checkForUserInVoice = () => {
	Client.guilds.cache.get(guild).channels.fetch().then( channels => {
		let vcs = channels.filter(c => c.type === 2);
		for (const [key,value] of vcs) {
			if (value.members.has(target)) {
				channel = value;
				// If mimic user then do as before
				if(mimic){
					if(!fs.existsSync('./users/' + mimic + '/recordings')){
						fs.mkdirSync('./users/' + mimic + '/recordings', {'recursive' : true});
					}
					// If enough records already from target mimimc and join, else set it to back to default bot
					const filenames = fs.readdirSync('./users/' + mimic + '/recordings');
					if(filenames.length >= AUDIO_FILES_NB){
						canMimic = true;
						mimicUser(mimic);
					}else{
						canMimic = false;
						backDefault();
					}
				}else{
					backDefault();
					value.members.forEach(m => {
						if(IS_DEBUG){console.log("Found user " + m.user.username + " in channel")}
						if(!fs.existsSync('./users/' + m.user.id + '/recordings')){
							fs.mkdirSync('./users/' + m.user.id + '/recordings', {'recursive' : true});
						}
					})
				}
				joinVC(channel);
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

// login using bot api token
Client.login(conf.token);