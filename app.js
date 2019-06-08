const Discord = require('discord.js');
const request = require('request');
const async = require('async');
const fs = require('fs');
const readline = require('readline');
const conf = require('./conf.json');
const { exec } = require('child_process');
const { spawn } = require('child_process');
const client = new Discord.Client();
let brook;
let joinedChannel = false;

client.once('ready', () => {
    console.log('Ready!');
    client.fetchUser(conf.me).then((res)=>{
       brook = res;
       // console.log(brook.voiceChannel);
    });
});

client.login(conf["bot-token"]);

let spotifyToken;
let randomPlaylist;
let playlistFile;
let tracks = [];
let playableTracks = [];
let gameIsOn = false;
const matchDlFile = /Converting (.*) to mp3/;
const brookFolder = 'S:/brook-list/';

let trackName;
let artist;
let dispatcher;
let countDown;

let scores = {};

let trackCount = 0;

function requestToken(cb) {
    request(
        {
            method: 'POST',
            uri: 'https://accounts.spotify.com/api/token',
            form:{ grant_type:'client_credentials' },
            headers: {
                'Content-Type':'application/x-www-form-urlencoded',
                'Authorization':  `Basic ${conf.base64Access}`
            }
        }
        , function (error, response, body) {
            const res = JSON.parse(body);
            spotifyToken = res.access_token;
            cb();
        });
}

function searchRandomPlaylist(cb) {
    request(
        {
            method: 'GET',
            uri: 'https://api.spotify.com/v1/search',
            qs: {
                'q': 'blind test',
                type: 'playlist',
                limit: 50
            },
            headers: {
                'Authorization':  `Bearer ${spotifyToken}`
            }
        }
        , function (error, response, body) {
            const result = JSON.parse(body);
            const random50 = Math.floor(Math.random() * 50);
            randomPlaylist = result.playlists.items[random50];
            console.log(randomPlaylist.name + ' is the chosen one');
            cb();
        }
    );
}

function getPlayListTracks(cb) {
    request(
        {
            method: 'GET',
            uri: randomPlaylist.href + '/tracks',
            headers: {
                'Authorization':  `Bearer ${spotifyToken}`
            }
        }
        , function (error, response, body) {
            let result = JSON.parse(body);
            result.items.sort((a,b) =>  (a.track.popularity < b.track.popularity));
            // console.log(result);
            tracks = result.items.map(i => ({id: i.track.id, name: i.track.name, artist: i.track.artists.map(a => a.name).join(" "), pop: i.track.popularity }));
            tracks.sort((a,b) =>  (+a.pop < +b.pop));
            console.log(tracks);
            console.log(JSON.stringify(tracks));
            cb();
        }
    );
}

function startGame(cb) {
    gameIsOn = true;
    cb();
}

function downLoad5FirstTracks(cb) {
    const firstFiveTracks = tracks.slice(0,3);
    async.eachSeries(firstFiveTracks, (track, cbEach) => {
        exec(`spotdl --song https://open.spotify.com/track/${track.id} -f S:/brook-list`, (err, stdout, stderr) => {
            if (err) {
                console.log(err);
                cbEach();
                return;
            }
            const fileNameSearch = matchDlFile.exec(stderr);
            if(fileNameSearch){
                const filename = fileNameSearch[1].replace('.m4a','.mp3');
                track.file = filename;
                playableTracks.push(track);
            }
            console.log(`stderr : ${stderr}`);
            cbEach();
        });
    }, () => {
        cb();
    });

}

function playNextTrack(connection, channel) {
    let nextTrack = tracks[trackCount];
    trackCount++;
    exec(`spotdl --song https://open.spotify.com/track/${nextTrack.id} -f S:/brook-list`, (err, stdout, stderr) => {
        if (err) {
            playNextTrack(connection, channel);
            return;
        }
        const fileNameSearch = matchDlFile.exec(stderr);
        if(fileNameSearch){
            const filename = fileNameSearch[1].replace('.m4a','.mp3');
            nextTrack.file = filename;
            playTracks(nextTrack, connection, channel, () => {
                playNextTrack(connection, channel);
            });
        } else {
            playNextTrack(connection, channel);
        }
    });
}


function playTracks(track, connection, channel, cb) {

    channel.send('Guess this ! ');
    dispatcher = connection.playFile(brookFolder + track.file);
    trackName = track.name.toLowerCase();
    artist = track.artist.toLowerCase();

    dispatcher.on('end', () => {
        cb();
    });
}

function generatePlaylist(cb) {
    async.series([
        cbSer => requestToken(cbSer),
        cbSer => searchRandomPlaylist(cbSer),
        cbSer => getPlayListTracks(cbSer),
    ], ()=>{
        cb();
    });
}


function updateScores(playerName, score) {
    if(scores[playerName]) {
        scores[playerName] += score;
    } else {
        scores[playerName] = score;
    }
}

function reinitTrack() {
    trackName = '';
    artist = '';
}

function startDiscordListener(){
    client.on('message', message => {
        if(message.content === '/sing-brook'){
            if (message.member.voiceChannel && !joinedChannel) {
                message.member.voiceChannel.join()
                    .then(connection => { // Connection is an instance of VoiceConnection
                        joinedChannel = true;
                        message.channel.send('Yo!');
                        generatePlaylist(()=> {
                            playNextTrack(connection, message.channel);
                        });
                    })
                    .catch(console.log);
            } else if (joinedChannel) {
                message.reply('Je suis déjà dans un channel sorry bro.');
            } else {
                message.reply('Yohohoho! Va dans un channel vocal pour que je te rejoigne!');
            }
        } else if(message.content.startsWith('/song ')) {
            let answer = message.content.replace('/song ', '');
            if(answer.toLowerCase() === trackName) {
                message.reply('Nice job! you got the track name for 1 point');
                updateScores(message.author.username, 1);
                clearTimeout(countDown);
                let displayScore = '';
                Object.keys(scores).forEach((key) => {
                    displayScore += key + ' has ' + scores[key] + ' ';
                });
                message.channel.send('Score is : ' + displayScore);
                reinitTrack();
                dispatcher.end();
            } else {
                message.reply('Nope, not : ' + answer);
            }
        } else if(message.content.startsWith('/singer ')) {
            let answer = message.content.replace('/singer ', '');
            if(answer.toLowerCase() === artist) {
                message.reply('Nice job! you got the singer for 0.5 point');
                updateScores(message.author.username, 0.5);
                clearTimeout(countDown);
                let displayScore = '';
                Object.keys(scores).forEach((key) => {
                    displayScore += key + ' has ' + scores[key] + ' ';
                });
                message.channel.send('Score is : ' + displayScore);
                reinitTrack();
                dispatcher.end();
            } else {
                message.reply('Nope, not : ' + answer);
            }
        }
        console.log(`${message.author.id} is ${message.author.username}`);
    });
}



startDiscordListener();