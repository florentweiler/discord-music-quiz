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

function playNextTrack(connection, channel) {
    let nextTrack = tracks[trackCount];
    trackCount++;
    exec(`spotdl --song https://open.spotify.com/track/${nextTrack.id} --trim-silence -f S:/brook-list`, (err, stdout, stderr) => {
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
    let tName = track.name;
    let tArtist = track.artist;
    var posT = tName.indexOf('(');
    var posA = tArtist.indexOf('(');
    trackName = tName.substring(0, posT === -1 ? posT = tName.length : posT);
    artist = tArtist.substring(0, posA === -1 ? posA = tArtist.length : posA);

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

function displayScoreThenNext(channel){
    let displayScore = '';
    Object.keys(scores).forEach((key) => {
        displayScore += '\n' + key + ' : ' + scores[key];
    });
    channel.send('```css\nScore:' + displayScore + '\n```');
    reinitTrack();
    dispatcher.end();
}

function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    var costs = new Array();
    for (var i = 0; i <= s1.length; i++) {
        var lastValue = i;
        for (var j = 0; j <= s2.length; j++) {
            if (i == 0)
                costs[j] = j;
            else {
                if (j > 0) {
                    var newValue = costs[j - 1];
                    if (s1.charAt(i - 1) != s2.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue),
                            costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0)
            costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}


function similarity(s1, s2) {
    var longer = s1;
    var shorter = s2;
    if (s1.length < s2.length) {
        longer = s2;
        shorter = s1;
    }
    var longerLength = longer.length;
    if (longerLength == 0) {
        return 1.0;
    }
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function isValidAnswer(answer, expected){
    let similarityResult = similarity(answer, expected);
    console.log(`Answer ${answer} and ${expected} have a similarity of : ${similarityResult}`);
    return (similarityResult > 0.85);
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
            // if(answer.toLowerCase() === trackName) {
            if(isValidAnswer(answer.toLowerCase(), trackName.toLowerCase())) {
                message.reply(`Nice job! you got the track name for 1 point, :musical_score: **${trackName}** :microphone: **${artist}**`);
                updateScores(message.author.username, 1);
                displayScoreThenNext(message.channel);
            } else {
                message.reply('Nope, not : ' + answer);
            }
        } else if(message.content.startsWith('/singer ')) {
            let answer = message.content.replace('/singer ', '');
            // if(answer.toLowerCase() === artist) {
            if(isValidAnswer(answer.toLowerCase(), artist.toLowerCase())) {
                message.reply(`Nice job! you got the singer for 0.5 point, :musical_score: **${trackName}** :microphone: **${artist}**`);

                updateScores(message.author.username, 0.5);
                displayScoreThenNext(message.channel);
            } else {
                message.reply('Nope, not : ' + answer);
            }
        }
        console.log(`${message.author.id} is ${message.author.username}`);
    });
}


startDiscordListener();