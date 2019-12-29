"use strict";
const utils =    require(__dirname + '/lib/utils');
const adapter = utils.adapter('samsungTizen');
const req = require('request-promise');
const wol = require('wake_on_lan');
const WebSocket = require('ws');

let ws;

adapter.on('stateChange', function (id, state) {
    const key = id.split('.');
    if (id === adapter.name + '.' + adapter.instance + '.apps.getInstalledApps'){
        getApps();
    } 
    if (key[2] === 'apps' && id !== adapter.name + '.' + adapter.instance + '.apps.getInstalledApps'){
        const app = key[3].split('-'); 
        startApp(app[1]);
    } 
    if (key[3].toUpperCase() === 'SENDKEY'){
        sendKey(state.val, 0);
    } else if (key[2] === 'control') {
        sendKey('KEY_' + key[3].toUpperCase(), 0);
    }
});
adapter.on('ready', function () {
main()
});
function main() {
    const objects = [
        {object:"apps.getInstalledApps",name:"getInstalledApps"},
        {object:"control.power",name:"on/off"},
        {object:"control.up",name:"up"},
        {object:"",name:""},
        {object:"",name:""},];
    adapter.setObject('apps.getInstalledApps', {
        type: 'state',
        common: {
            name: 'getInstalledApps',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.power', {
        type: 'state',
        common: {
            name: 'on/off',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.up', {
        type: 'state',
        common: {
            name: 'up',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.down', {
        type: 'state',
        common: {
            name: 'down',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.left', {
        type: 'state',
        common: {
            name: 'left',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.right', {
        type: 'state',
        common: {
            name: 'right',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.chup', {
        type: 'state',
        common: {
            name: 'channel up',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.chdown', {
        type: 'state',
        common: {
            name: 'channel down',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.ch_list', {
        type: 'state',
        common: {
            name: 'channel list',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.enter', {
        type: 'state',
        common: {
            name: 'enter',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.return', {
        type: 'state',
        common: {
            name: 'return',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.menu', {
        type: 'state',
        common: {
            name: 'menu',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.source', {
        type: 'state',
        common: {
            name: 'source',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.guide', {
        type: 'state',
        common: {
            name: 'guide',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.tools', {
        type: 'state',
        common: {
            name: 'tools',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.info', {
        type: 'state',
        common: {
            name: 'info',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.red', {
        type: 'state',
        common: {
            name: 'red',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.blue', {
        type: 'state',
        common: {
            name: 'blue',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.green', {
        type: 'state',
        common: {
            name: 'green',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.yellow', {
        type: 'state',
        common: {
            name: 'yellow',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.volup', {
        type: 'state',
        common: {
            name: 'volume up',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.voldown', {
        type: 'state',
        common: {
            name: 'volume down',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.mute', {
        type: 'state',
        common: {
            name: 'volume mute',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.0', {
        type: 'state',
        common: {
            name: 'key 0',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.1', {
        type: 'state',
        common: {
            name: 'key 1',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.2', {
        type: 'state',
        common: {
            name: 'key  2',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.3', {
        type: 'state',
        common: {
            name: 'key 3',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.4', {
        type: 'state',
        common: {
            name: 'key 4',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.5', {
        type: 'state',
        common: {
            name: 'key 5',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.6', {
        type: 'state',
        common: {
            name: 'key 6',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.7', {
        type: 'state',
        common: {
            name: 'key 7',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.8', {
        type: 'state',
        common: {
            name: 'key 8',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.9', {
        type: 'state',
        common: {
            name: 'key 9',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.dtv', {
        type: 'state',
        common: {
            name: 'tv source',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.hdmi', {
        type: 'state',
        common: {
            name: 'hdmi source',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.contents', {
        type: 'state',
        common: {
            name: 'smart hub',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    adapter.setObject('control.sendKey', {
        type: 'state',
        common: {
            name: 'sendKey',
            type: 'string',
            role: 'state'
        },
        native: {}
    });
	
    adapter.setObject('powerOn', {
        type: 'state',
        common: {
            name: 'power state of TV',
            type: 'boolean',
            role: 'state'
        },
        native: {}
    });   
    if (parseFloat(adapter.config.pollingInterval) > 0){getPowerOnState();}
    adapter.subscribeStates('control.*');
    adapter.subscribeStates('apps.*');
    adapter.log.info(adapter.name + '.' + adapter.instance + ' NIGHTLY started with config : ' + JSON.stringify(adapter.config));
}
function getPowerOnState(){
    setInterval(function(){
        req({uri:'http://' + adapter.config.ipAddress + ':' + adapter.config.pollingEndpoint, timeout:10000})
        .then(()=> {
                adapter.setState('powerOn', true, true, function (err) {
                    if (err) adapter.log.error(err);
                });
        })
        .catch(error => {       	   
                adapter.setState('powerOn', false, true, function (err) {
                    if (err) adapter.log.error(err);
                });
        })
    }, parseFloat(adapter.config.pollingInterval) * 1000)
}
async function wsConnect() {
    adapter.log.info( 'ws connect ');
    let wsUrl = adapter.config.protocol + '://' + adapter.config.ipAddress + ':' + adapter.config.port + '/api/v2/channels/samsung.remote.control?name=' + (new Buffer("ioBroker")).toString('base64');
    if (parseFloat(adapter.config.token) > 0) {wsUrl = wsUrl + '&token=' + adapter.config.token}
    adapter.log.info('open connection: ' + wsUrl );
    try {
        ws = new WebSocket(wsUrl, {rejectUnauthorized : false});
        ws.on('message', function incoming(data) {
            data = JSON.parse(data);
            if(data.event == "ms.channel.connect") {
                adapter.log.info( 'ws connected ');
                return true;
            }
        });
    } 
    catch(error){
        return error;
    }
};
async function wsSend(msg) {
    adapter.log.info( 'ws send '+ JSON.stringify(msg));
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
async function wsClose() {
    adapter.log.info( 'ws close');

    try {
        ws.close()
    } 
    catch(error){
        return error;
    }
};
async function sendKey(key, x) {
    adapter.log.info( 'sendKey started: ' + key + ' x: '+x);
    try{
        await wsConnect();
        setTimeout(function() {
            wsSend({"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":key,"Option":"false","TypeOfRemote":"SendRemoteKey"}})
            adapter.log.info( 'sendKey: ' + key + ' successfully sent to tv');
            wsClose();
            return;
        }, 1000);
    }
    catch (error){
        adapter.log.info(error);
        if ( x == 0 ){
            if(parseFloat(adapter.config.macAddress) > 0){
                adapter.log.info('Error while sendKey: ' + key + ' error: ' + error + ' retry 1/5 will be executed'); 
                adapter.log.info('Will now try to switch TV with MAC: ' + adapter.config.macAddress + ' on');
                wol.wake(adapter.config.macAddress);
                x++;
                sendKey(key, x);
            };
        }
        if ( x < 5) {
            setTimeout(function() {x++;             
            adapter.log.info('Error while sendKey: ' + key + ' error: ' + error + ' retry '+ x + '/5 will be executed'); 
            sendKey(key, x);}, 1000);

        }
        if ( x >= 5) {
            adapter.log.info('Error while sendKey: ' + key + ' error: ' + error + ' maximum retries reached'); 
            return error;        
        }
        await wsClose();
    }
};
async function getApps() {
    let x = 0;
    try{
        await wsConnect();
        let data = await wsSend({"method":"ms.channel.emit","params":{"event": "ed.installedApp.get", "to":"host"}})
        data = JSON.parse(data);
        for(let i = 0; i <= data.data.data.length; i++){
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
        return 'getInstalledApps successfully sent to tv';
    }
    catch (error){
        if ( x == 0 ){
            if(parseFloat(adapter.config.macAddress) > 0){
                adapter.log.info('Will now try to switch TV with MAC: ' + adapter.config.macAddress + ' on');
                wol.wake(adapter.config.macAddress);
            };
            continue;   
        }
        if ( x < 5) {x++;setTimeout(function() {continue;}, 1000);}
        return 'Error while getInstalledApps, error: ' + error;
    }
    finally {
        await wsconn.close();
    }
};
async function startApp(app) {
    adapter.log.info(app)
    let x = 0;
    try{
        await wsConnect();
        let data = await wsSend({"method":"ms.channel.emit","params":{"event": "ed.installedApp.get", "to":"host"}})
        data = JSON.parse(data);
        for(let i = 0; i <= data.data.data.length; i++){
            if( app === data.data.data[i].name){
                wsSend({"method":"ms.channel.emit","params":{"event": "ed.apps.launch", "to":"host", "data" :{ "action_type" : data.data.data[i].app_type == 2 ? 'DEEP_LINK' : 'NATIVE_LAUNCH',"appId":data.data.data[i].appId}}});
                return 'app: ' +  app + ' successfully started';
            }
            return 'app: ' +  app + ' cannot be started';
        }
    }
    catch (error){
        if ( x == 0 ){
            if(parseFloat(adapter.config.macAddress) > 0){
                adapter.log.info('Will now try to switch TV with MAC: ' + adapter.config.macAddress + ' on');
                wol.wake(adapter.config.macAddress);
            };
            continue;   
        }
        if ( x < 5) {x++;setTimeout(function() {continue;}, 1000);}
        return 'Error while startApp: ' + app + ', error: ' + error;
    }
    finally {
        await wsClose();
    }
};