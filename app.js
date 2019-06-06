const Discord = require('discord.js');
const request = require('request');
const async = require('async');
const fs = require('fs');
const readline = require('readline');
const conf = require('./conf.json');
const { exec } = require('child_process');
const { spawn } = require('child_process');
const client = new Discord.Client();

let persons = {
    ZODD: '261246570727473152',
    MEHD: '243462209882161152',
    MOI: '248538326955458560',
    BEN: '338688803088629760',
};

client.once('ready', () => {
    console.log('Ready!');
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
            const result = JSON.parse(body);
            tracks = result.items.map(i => ({id: i.track.id, name: i.track.name, artist: i.track.artists.map(a => a.name).join(" ") }));
            // console.log(JSON.stringify(tracks));
            cb();
        }
    );
}

function getTrackInfos(id, cb) {
    request(
        {
            method: 'GET',
            uri: 'https://api.spotify.com/v1/tracks/' + id,
            headers: {
                'Authorization':  `Bearer ${spotifyToken}`
            }
        }
        , function (error, response, body) {
            // console.log(body);

            // const result = JSON.parse(body);
            // const random50 = Math.floor(Math.random() * 50);
            // randomPlaylist = result.playlists.items[random50];
            // console.log(randomPlaylist.name + ' is the chosen one');
            // cb();
        }
    );
}

function startGame(cb) {
    gameIsOn = true;
    cb();
}

function downLoad5FirstTracks(cb) {
    const firstThreeTracks = tracks.slice(0,5);
    async.eachSeries(firstThreeTracks, (track, cbEach) => {
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

function generatePlaylist(cb) {
    async.series([
        cbSer => requestToken(cbSer),
        cbSer => searchRandomPlaylist(cbSer),
        cbSer => getPlayListTracks(cbSer),
        cbSer => downLoad5FirstTracks(cbSer),
        cbSer => startGame(cbSer),
    ], ()=>{
        cb();
    });
}

function playTracks(connection) {
    async.eachSeries(playableTracks, (track, cbEach) => {
        const dispatcher = connection.playFile(brookFolder + track.file);
        dispatcher.on('end', () => {
            cbEach();
        })
    },()=> {

    });
}

function startDiscordListener(){
    client.on('message', message => {
        if(message.content === '/sing-brook'){
            if (message.member.voiceChannel) {
                message.member.voiceChannel.join()
                    .then(connection => { // Connection is an instance of VoiceConnection
                        message.channel.send('Yo!');
                        // connection.playArbitraryInput('https://open.spotify.com/playlist/7nWLr7ueGPIjP6Guk9TIc8');
                        generatePlaylist(()=> {
                            message.channel.send('Guess this ! ');
                            playTracks(connection);
                            // console.log('about to play : ' + brookFolder + playableTracks[0].file);
                            // const dispatcher = connection.playFile(brookFolder + playableTracks[0].file);
                        });
                    })
                    .catch(console.log);
            } else {
                message.reply('Yohohoho! Va dans un channel vocal pour que je te rejoigne!');
            }
        }
        console.log(`${message.author.id} is ${message.author.username}`);
    });
}

requestToken(()=>{
    startDiscordListener();
});


// generatePlaylist(()=> {
//     const stream = fs.createReadStream(brookFolder + tracks[0].file);
//     connection.playStream(stream);
// });