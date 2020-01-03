"use strict";
const utils =    require(__dirname + '/lib/utils');
const keys =    require(__dirname + '/lib/remotekeys');
const adapter = utils.adapter('samsungTizen');
const isPortReachable = require('is-port-reachable');
const wol = require('wake_on_lan');
const WebSocket = require('ws');

let ws

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
    if (key[3].toUpperCase() === 'SENDCMD'){
        sendCmd(state.val.split(','), 0);
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
    if (parseFloat(adapter.config.pollingInterval) > 0){getPowerOnState();};
    adapter.subscribeStates('control.*');
    adapter.subscribeStates('apps.*');
    adapter.subscribeStates('command.*');
    adapter.subscribeStates('config.*');
    adapter.log.info(adapter.name + '.' + adapter.instance + ' release 0.0.6 started with config : ' + JSON.stringify(adapter.config));
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
        })();

    }, parseFloat(adapter.config.pollingInterval) * 1000)
}
function wsConnect(done) {
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
        data = JSON.parse(data);
        if(data.event == "ms.channel.connect") {
            done(0);
        }
    });
};
function wserror(func, action, err, x, done){
    if (ws !== null){
        ws.close();
        adapter.log.info('websocket connection closed');
    }
    if ( x < 1 ){
        if(parseFloat(adapter.config.macAddress) > 0){
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
            if (ws !== null){
                ws.close();
                adapter.log.info('websocket connection closed');
            }
          }
        });
};
function sendCmd(cmd, x) {
    wsConnect(function(err) {
        if (err){
            wserror('sendCommand', cmd, err, x, function(error){
                if(!error){
                    x++;
                    sendCmd(cmd,x);
                }
            })
        } if (!err) {
            let i = 0;
            if (i < cmd.length){
                delay(function(e){
                    if(!e){
                        if (ws !== null){
                            ws.send(JSON.stringify({"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":cmd[i],"Option":"false","TypeOfRemote":"SendRemoteKey"}}));
                            adapter.log.info( 'sendKey: ' + cmd[i] + ' successfully sent to tv');
                            i++
                            if (i == cmd.length-1){
                                adapter.log.info( 'sendCommand: ' + cmd + ' successfully sent to tv');
                                if (ws !== null){
                                    ws.close();
                                    adapter.log.info('websocket connection closed');
                                };
                            }
                        };
                    };
                });
            };

          }
        });
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
                if (ws !== null){
                    ws.close();
                    adapter.log.info('websocket connection closed');
                }
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
                            if (ws !== null){
                                ws.close();
                                adapter.log.info('websocket connection closed');
                            }
                        }
                    }
                }
            });
          }
        });
};