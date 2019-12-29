"use strict";
const utils =    require('./utils.js');
const adapter = utils.adapter('samsungTizen');
const WebSocket = require('ws');

let ws;


async function connect() {
    let wsUrl = adapter.config.protocol + '://' + adapter.config.ipAddress + ':' + adapter.config.port + '/api/v2/channels/samsung.remote.control?name=' + (new Buffer("ioBroker")).toString('base64');
    if (parseFloat(adapter.config.token) > 0) {wsUrl = wsUrl + '&token=' + token;}
    adapter.log.info('open connection: ' + wsUrl );
    try {
        ws = new WebSocket(wsUrl, {rejectUnauthorized : false});
        ws.on('message', function incoming(data) {
            data = JSON.parse(data);
            if(data.event == "ms.channel.connect") {
                return 'connected';
            }
        });
    } 
    catch(error){
        return error;
    }
};
async function send(msg) {
    try {
        ws.send(JSON.stringify(msg));
        ws.on('message', function incoming(data) {
            return JSON.parse(data);
          });
    } 
    catch(error){
        return error;
    }
};
async function close() {
    try {
        ws.close()
    } 
    catch(error){
        return error;
    }
};

exports.connect = connect;
exports.send = send;
exports.close = close;


