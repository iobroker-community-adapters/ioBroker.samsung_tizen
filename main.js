"use strict";
//const utils =    require(__dirname + '/lib/utils');
const utils = require('@iobroker/adapter-core');
const keys =    require(__dirname + '/lib/remotekeys');
const adapter = utils.adapter('samsung_tizen');
const isPortReachable = require('is-port-reachable');
const wol = require('wake_on_lan');
const WebSocket = require('ws');
const http = require('node:http');

let ws;

// UPnP RenderingControl service, used for volume and mute.
// The port is fixed: these TVs do not answer SSDP discovery, and 9197 only
// listens while the TV is switched on.
const UPNP_PORT = 9197;
const UPNP_PATH = '/upnp/control/RenderingControl1';
const UPNP_SERVICE = 'urn:schemas-upnp-org:service:RenderingControl:1';
const UPNP_MASTER = '<InstanceID>0</InstanceID><Channel>Master</Channel>';

adapter.on('stateChange', function (id, state) {
    const key = id.split('.');
    if (id === adapter.name + '.' + adapter.instance + '.apps.getInstalledApps'){
        getApps(0);
    } 
    if (key[2] === 'apps' && id !== adapter.name + '.' + adapter.instance + '.apps.getInstalledApps'){
        const app = key[3].split('_'); 
        startApp(app[1], 0);
    } 
    if (key[2] === 'command'){
        adapter.getForeignObject(id, function (err, obj) {
            if (err) {
                adapter.log.error(err);
            } else {
                sendCmd(obj.common.name.split(','), 0);
            }
        });
    } 
    if (key[2] === 'config' && key[3] === 'getToken'){
        getToken();
    } 
    if (key[2] === 'media' && state && !state.ack){
        if (key[3] === 'volume'){ setVolume(state.val); }
        if (key[3] === 'mute'){ setMute(state.val); }
        return;
    }
    if (key[3].toUpperCase() === 'SENDCMD'){
        sendCmd(state.val.split(','), 0);
    }
    if (key[3].toUpperCase() === 'KEY_POWERON'||key[3].toUpperCase() === 'KEY_POWEROFF'){
        onoff(key[3].toUpperCase());
    } else if (key[2] === 'control') {
        sendKey(key[3].toUpperCase(), 0);
    }
});
adapter.on('ready', function () {
main()
});
function main() {
    const objects = keys.keys;
    for(let i = 0; i < objects.length; i++){
        adapter.setObject(objects[i].object, {
            type: 'state',
            common: {
                name: objects[i].name,
                type: 'boolean',
                role: 'button'
            },
            native: {}
        });    
    };
    adapter.setObject('control.sendCmd', {
        type: 'state',
        common: {
            name: 'send multiple keys seperated with ","',
            type: 'string',
            role: 'state'
        },
        native: {}
    });
    if (adapter.config.useUPnPVolume){createVolumeStates();}
    if (parseFloat(adapter.config.pollingInterval) > 0){getPowerOnState();};
    adapter.subscribeStates('control.*');
    adapter.subscribeStates('apps.*');
    adapter.subscribeStates('command.*');
    adapter.subscribeStates('config.*');
    if (adapter.config.useUPnPVolume){
        adapter.subscribeStates('media.*');
        updateVolumeStates();
    }
    adapter.log.info(adapter.name + '.' + adapter.instance + ' started with config : ' + JSON.stringify(adapter.config));
}
function getPowerOnState(){
    adapter.setObject('powerOn', {
        type: 'state',
        common: {
            name: 'power state of TV',
            type: 'boolean',
            role: 'state'
        },
        native: {}
    });  
    setInterval(function(){
        (async () => {
            let response = await isPortReachable(adapter.config.pollingPort, {host: adapter.config.ipAddress});
            adapter.setState('powerOn', response, true, function (err) {
                if (err) adapter.log.error(err);
            });
            // port 9197 is closed while the TV is in standby
            if (response && adapter.config.useUPnPVolume){ await updateVolumeStates(); }
        })();

    }, parseFloat(adapter.config.pollingInterval) * 1000)
}
function wsConnect(done) {
    if (typeof ws === 'undefined' || ws.readyState !== 1 ){
        let wsUrl = adapter.config.protocol + '://' + adapter.config.ipAddress + ':' + adapter.config.port + '/api/v2/channels/samsung.remote.control?name=' + (new Buffer("ioBroker")).toString('base64');
        if (parseFloat(adapter.config.token) > 0) {wsUrl = wsUrl + '&token=' + adapter.config.token}
        adapter.log.info('open connection: ' + wsUrl );
        ws = new WebSocket(wsUrl, {rejectUnauthorized : false}, function(error) {
            done(new Error(error));
        });
        ws.on('error', function (e) {
            done(e);
        });
        ws.on('message', function incoming(data) {
            if(data.includes('event')){
                data = JSON.parse(data);
                if(data.event == "ms.channel.connect") {
                    done(0);
                }
            }
        });
    } else if (ws.readyState === 1){
        done(0);
    }
};
function wserror(func, action, err, x, done){
    if (ws.readyState > 0){
        ws.close();
        adapter.log.info('websocket connection closed');
    }
    if ( x == 0 ){
        if(adapter.config.macAddress !== '0'){
            adapter.log.info('Error while: ' + func + ', action: ' + action + ' error: ' + err + ' retry 1/5 will be executed'); 
            adapter.log.info('Will now try to switch TV with MAC: ' + adapter.config.macAddress + ' on');
            wol.wake(adapter.config.macAddress);
            done(0);
        };
        if(parseFloat(adapter.config.macAddress) === 0){ done(0)}
    }
    else if ( x < 5) {
        setTimeout(function() {
            x++;             
            adapter.log.info('Error while: ' + func + ', action: ' + action + '  error: ' + err + ' retry '+ x + '/5 will be executed'); 
            done(0);
        }, 2000);
    }
    else if ( x > 4) {
        adapter.log.info('Error while: ' + func + ', action: ' + action + ' error: ' + err + ' maximum retries reached'); 
        done(new Error('Error while: ' + func + ', action: ' + action + ' error: ' + err + ' maximum retries reached'));            
    }
}
function getToken() {
    let wsUrl = adapter.config.protocol + '://' + adapter.config.ipAddress + ':' + adapter.config.port + '/api/v2/channels/samsung.remote.control?name=' + (new Buffer("ioBroker")).toString('base64');
    adapter.log.info('open connection: ' + wsUrl );
    ws = new WebSocket(wsUrl, {rejectUnauthorized : false}, function(error) {
        adapter.log.info(new Error(error));
      });
    ws.on('error', function (e) {
        adapter.log.info(e);
    });
    ws.on('message', function incoming(data) {
        data = JSON.parse(data);
        if(data.event == "ms.channel.connect") {
            adapter.log.info('getToken done, token: ' + data.data.token);
            adapter.setObject('config.token', {
                type: 'state',
                common: {
                    name: data.data.token,
                    type: 'string',
                    role: 'state'
                },
                native: {}
            });
        }
    });
};
function sendKey(key, x) {
    wsConnect(function(err) {
        if (err){
            adapter.log.info(err);
            wserror('sendKey', key, err, x, function(error){
                if(!error){
                    x++;
                    if (key !== 'KEY_POWER'){sendKey(key,x)};
                }
            })
        } if (!err) {
            ws.send(JSON.stringify({"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":key,"Option":"false","TypeOfRemote":"SendRemoteKey"}}));
            adapter.log.info( 'sendKey: ' + key + ' successfully sent to tv');
          }
        });
};
function sendCmd(cmd, x) {
    wsConnect(function(err) {
        if (err){
            wserror('sendCommand', cmd, err, x, function(error){
                if(!error){
                    if (cmd[x]=== 'KEY_POWERON'){
                        cmd.splice(x, 1)
                        if (x <= cmd.length){
                            adapter.log.info( 'sendCommand: ' + cmd + ' successfully sent to tv');
                        };
                    }
                    x++;
                    sendCmd(cmd,x);
                }
            })
        } if (!err) {
            loop(0);
            function loop(i){
                if (i < cmd.length){
                    delay(function(e){
                        if(!e){
                            if (ws.readyState > 0){
                                if (cmd[i]=== 'KEY_POWERON'||cmd[i]=== 'KEY_POWEROFF'){ 
                                    onoff(cmd[i])
                                    i++;
                                    if (i === cmd.length){
                                        adapter.log.info( 'sendCommand: ' + cmd + ' successfully sent to tv');
                                    };
                                    loop(i)
                                }
                                else if(cmd[i] !== 'KEY_POWERON'||cmd[i] !== 'KEY_POWEROFF'){
                                    ws.send(JSON.stringify({"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":cmd[i],"Option":"false","TypeOfRemote":"SendRemoteKey"}}));
                                    adapter.log.info( 'sendKey: ' + cmd[i] + ' successfully sent to tv');
                                    i++;
                                    if (i === cmd.length){
                                        adapter.log.info( 'sendCommand: ' + cmd + ' successfully sent to tv');
                                    };
                                    loop(i)
                                };
                            };
                        };
                    });
                };
            }
          }
        });
};
async function onoff(key) {
        if (key === 'KEY_POWERON'){
            let res = await getPowerStateInstant() 
            if (!res){ sendKey('KEY_POWER',0)}
            if(res){ adapter.log.info('TV is already on')}
        }
        if (key === 'KEY_POWEROFF'){
            let res = await getPowerStateInstant() 
            if (res){ sendKey('KEY_POWER',0)}
            if(!res){ adapter.log.info('TV is already off')}
        }
};
function delay(done){
    setTimeout(function() {            
        done(0);
    }, parseFloat(adapter.config.cmdDelay));
};
function getApps(x) {
    wsConnect(function(err) {
        if (err){
            wserror('getInstalledApps', 'get', err, x, function(error){
                if(!error){
                    x++;
                    getApps(x);
                }
            })
        } if (!err) {
            ws.send(JSON.stringify({"method":"ms.channel.emit","params":{"event": "ed.installedApp.get", "to":"host"}}));
            ws.on('message', function incoming(data) {
                data = JSON.parse(data);
                for(let i = 0; i < data.data.data.length; i++){
                    adapter.setObject('apps.start_'+data.data.data[i].name, {
                        type: 'state',
                        common: {
                            name: data.data.data[i].appId,
                            type: 'boolean',
                            role: 'button'
                        },
                        native: {}
                    });
                }
                adapter.log.info('getInstalledApps successfully sent to tv')
            })
        };

    });
};
function startApp(app,x) {
    wsConnect(function(err) {
        if (err){
            wserror('startApp', app, err, x, function(error){
                if(!error){
                    x++;
                    startApp(app,x);
                }
            })
        } if (!err) {
            ws.send(JSON.stringify({"method":"ms.channel.emit","params":{"event": "ed.installedApp.get", "to":"host"}}));
            ws.on('message', function incoming(data) {
                data = JSON.parse(data);
                if (data.event === 'ed.installedApp.get'){
                    for(let i = 0; i < data.data.data.length; i++){
                        if( app === data.data.data[i].name){
                            ws.send(JSON.stringify({"method":"ms.channel.emit","params":{"event": "ed.apps.launch", "to":"host", "data" :{ "action_type" : data.data.data[i].app_type === 1||2 ? 'DEEP_LINK' : 'NATIVE_LAUNCH',"appId":data.data.data[i].appId}}}));
                            adapter.log.info('app: ' +  app + ' successfully started');
                        }
                    }
                }
            });
          }
        });
};
async function getPowerStateInstant(){
            let response = await isPortReachable(adapter.config.pollingPort, {host: adapter.config.ipAddress});
            adapter.setState('powerOn', response, true, function (err) {
                if (err) adapter.log.error(err);
            });
            return response
        
}

function createVolumeStates() {
    adapter.setObject('media', {
        type: 'channel',
        common: {
            name: 'volume and mute'
        },
        native: {}
    });
    adapter.setObject('media.volume', {
        type: 'state',
        common: {
            name: 'volume level',
            type: 'number',
            role: 'level.volume',
            min: 0,
            max: 100,
            def: 0,
            read: true,
            write: true
        },
        native: {}
    });
    adapter.setObject('media.mute', {
        type: 'state',
        common: {
            name: 'mute',
            type: 'boolean',
            role: 'media.mute',
            def: false,
            read: true,
            write: true
        },
        native: {}
    });
}
// Send a SOAP action to the TV. Resolves with the response body, or null on error.
function upnpRequest(action, args) {
    return new Promise((resolve) => {
        const envelope = '<?xml version="1.0" encoding="utf-8"?>'
            + '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
            + '<s:Body><u:' + action + ' xmlns:u="' + UPNP_SERVICE + '">' + args + '</u:' + action + '></s:Body>'
            + '</s:Envelope>';
        const req = http.request({
            hostname: adapter.config.ipAddress,
            port: UPNP_PORT,
            path: UPNP_PATH,
            method: 'POST',
            timeout: 5000,
            headers: {
                'Content-Type': 'text/xml; charset="utf-8"',
                'SOAPACTION': '"' + UPNP_SERVICE + '#' + action + '"',
                'Content-Length': Buffer.byteLength(envelope)
            }
        }, function (res) {
            let data = '';
            res.on('data', function (chunk) { data += chunk; });
            res.on('end', function () {
                const error = data.match(/<errorCode>(\d+)<\/errorCode>/);
                if (error) {
                    if (error[1] === '401') {
                        // the TV only answers clients on its own subnet
                        adapter.log.warn('UPnP ' + action + ' refused (401 Unauthorized): the TV only accepts this from its own subnet, and ioBroker appears to be on a different one');
                    } else {
                        adapter.log.warn('UPnP ' + action + ' failed with upnp:' + error[1]);
                    }
                    resolve(null);
                } else {
                    resolve(data);
                }
            });
        });
        req.on('error', function (e) {
            adapter.log.debug('UPnP ' + action + ' request failed: ' + e.message);
            resolve(null);
        });
        req.on('timeout', function () {
            req.destroy();
            adapter.log.debug('UPnP ' + action + ' request timed out');
            resolve(null);
        });
        req.end(envelope);
    });
}
// Read volume and mute from the TV and store them as acknowledged states
async function updateVolumeStates() {
    const volume = await upnpRequest('GetVolume', UPNP_MASTER);
    if (volume) {
        const match = volume.match(/<CurrentVolume>(\d+)<\/CurrentVolume>/);
        if (match) { adapter.setState('media.volume', parseInt(match[1], 10), true); }
    }
    const mute = await upnpRequest('GetMute', UPNP_MASTER);
    if (mute) {
        const match = mute.match(/<CurrentMute>([^<]+)<\/CurrentMute>/);
        if (match) { adapter.setState('media.mute', match[1] === '1' || match[1] === 'true', true); }
    }
}
async function setVolume(value) {
    const volume = Math.round(parseFloat(value));
    // the TV rejects anything outside 0-100 with upnp:402, so catch it here
    if (isNaN(volume) || volume < 0 || volume > 100) {
        adapter.log.warn('media.volume: ' + value + ' is not a level between 0 and 100, ignored');
        await updateVolumeStates();
        return;
    }
    const res = await upnpRequest('SetVolume', UPNP_MASTER + '<DesiredVolume>' + volume + '</DesiredVolume>');
    if (res) { adapter.log.info('volume set to ' + volume); }
    // read back, so the state reflects the TV even if the command was refused
    await updateVolumeStates();
}
async function setMute(value) {
    const res = await upnpRequest('SetMute', UPNP_MASTER + '<DesiredMute>' + (value ? 1 : 0) + '</DesiredMute>');
    if (res) { adapter.log.info('mute set to ' + !!value); }
    await updateVolumeStates();
}
