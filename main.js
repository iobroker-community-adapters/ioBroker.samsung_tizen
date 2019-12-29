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
        getApps(0);
    } 
    if (key[2] === 'apps' && id !== adapter.name + '.' + adapter.instance + '.apps.getInstalledApps'){
        const app = key[3].split('-'); 
        startApp(app[1], 0);
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
        {object:"control.up",name:"arrow up"},
        {object:"control.down",name:"arrow down"},
        {object:"control.left",name:"arrow left"},
        {object:"control.right",name:"arrow right"},
        {object:"control.chup",name:"channel up"},
        {object:"control.chdown",name:"chhannel down"},
        {object:"control.ch_list",name:"channel list"},
        {object:"control.enter",name:"enter"},
        {object:"control.return",name:"return"},
        {object:"control.menu",name:"menu"},
        {object:"control.source",name:"source"},
        {object:"control.guide",name:"guide"},
        {object:"control.tools",name:"tools"},
        {object:"control.info",name:"info"},
        {object:"control.red",name:"red"},
        {object:"control.blue",name:"blue"},
        {object:"control.green",name:"green"},
        {object:"control.yellow",name:"yellow"},
        {object:"control.volup",name:"volume up"},
        {object:"control.voldown",name:"volume down"},
        {object:"control.mute",name:"volume mute"},
        {object:"control.0",name:"0"},
        {object:"control.1",name:"1"},
        {object:"control.2",name:"2"},
        {object:"control.3",name:"3"},
        {object:"control.4",name:"4"},
        {object:"control.5",name:"5"},
        {object:"control.6",name:"6"},
        {object:"control.7",name:"7"},
        {object:"control.8",name:"8"},
        {object:"control.9",name:"9"},
        {object:"control.dtv",name:"dtv"},
        {object:"control.hdmi",name:"hdmi"},
        {object:"control.contents",name:"contents"},
        {object:"control.sendKey",name:"sendKey manually"},
        {object:"powerOn",name:"power state of TV"}];

        for(let i = 0; i <= objects; i++){
            adapter.setObject(objects[i].name, {
                type: 'state',
                common: {
                    name: objects.appId,
                    type: 'boolean',
                    role: 'button'
                },
                native: {}
            });
        }
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
    let wsUrl = adapter.config.protocol + '://' + adapter.config.ipAddress + ':' + adapter.config.port + '/api/v2/channels/samsung.remote.control?name=' + (new Buffer("ioBroker")).toString('base64');
    if (parseFloat(adapter.config.token) > 0) {wsUrl = wsUrl + '&token=' + adapter.config.token}
    adapter.log.info('open connection: ' + wsUrl );
    try {
        ws = new WebSocket(wsUrl, {rejectUnauthorized : false});
        ws.on('message', function incoming(data) {
            data = JSON.parse(data);
            if(data.event == "ms.channel.connect") {
                return true;
            }
        });
    } 
    catch(error){
        return error;
    }
};
async function wsClose() {
    try {
        ws.close()
    } 
    catch(error){
        return error;
    }
};
async function sendKey(key, x) {
    try{
        await wsConnect();
        setTimeout(function() {
            try {
                ws.send(JSON.stringify({"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":key,"Option":"false","TypeOfRemote":"SendRemoteKey"}}));
                ws.on('message', function incoming(data) {
                    adapter.log.info( 'sendKey: ' + key + ' successfully sent to tv');
                    wsClose();
                    return;
                });
            } 
            catch(error){
                return error;
            }
            return;
        }, 1500);
    }
    catch (error){
        adapter.log.info(error);
        if ( x == 0 ){
            if(parseFloat(adapter.config.macAddress) > 0){
                adapter.log.info('Error while sendKey: ' + key + ' error: ' + error + ' retry 1/5 will be executed'); 
                adapter.log.info('Will now try to switch TV with MAC: ' + adapter.config.macAddress + ' on');
                wol.wake(adapter.config.macAddress);
            };
            x++;
            sendKey(key, x);
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
async function getApps(x) {
    try{
        await wsConnect();
        setTimeout(async function() {
            try {
                ws.send(JSON.stringify({"method":"ms.channel.emit","params":{"event": "ed.installedApp.get", "to":"host"}}));
                ws.on('message', function incoming(data) {
                    adapter.log.info(data);
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
                    adapter.log.info('getInstalledApps successfully sent to tv')
                    wsClose();
                    return;
                });
            } 
            catch(error){
                return error;
            }
        },1000)
        return;
    }
    catch (error){
        adapter.log.info(error);
        if ( x == 0 ){
            if(parseFloat(adapter.config.macAddress) > 0){
                adapter.log.info('Error while getInstalledApps, error: ' + error + ' retry 1/5 will be executed'); 
                adapter.log.info('Will now try to switch TV with MAC: ' + adapter.config.macAddress + ' on');
                wol.wake(adapter.config.macAddress);
            };
            x++;
            getApps(x);
        }
        if ( x < 5) {
            setTimeout(function() {x++;             
            adapter.log.info('Error while getInstalledApps, error: ' + error + ' retry '+ x + '/5 will be executed'); 
            getApps(x);}, 1000);

        }
        if ( x >= 5) {
            adapter.log.info('Error while getInstalledApps, error: ' + error + ' maximum retries reached'); 
            return error;        
        }
        await wsClose();
    }
};
async function startApp(app, x) {
    adapter.log.info(app)
    try{
        await wsConnect();
        setTimeout(async function() {
            try {
                ws.send(JSON.stringify({"method":"ms.channel.emit","params":{"event": "ed.installedApp.get", "to":"host"}}));
                ws.on('message', function incoming(data) {
                    adapter.log.info(data);
                    data = JSON.parse(data);
                    if (data.event === 'ed.installedApp.get'){
                        for(let i = 0; i <= data.data.data.length; i++){
                            if( app === data.data.data[i].name){
                                ws.send(JSON.stringify({"method":"ms.channel.emit","params":{"event": "ed.apps.launch", "to":"host", "data" :{ "action_type" : data.data.data[i].app_type == 2 ? 'DEEP_LINK' : 'NATIVE_LAUNCH',"appId":data.data.data[i].appId}}}));
                                wsClose();
                                return 'app: ' +  app + ' successfully started';
                            }
                            return 'app: ' +  app + ' cannot be started';
                        }
                    }
                    return;
                });
            } 
            catch(error){
                return error;
            }
        });
    }
    catch (error){
        adapter.log.info(error);
        if ( x == 0 ){
            if(parseFloat(adapter.config.macAddress) > 0){
                adapter.log.info('Error while getInstalledApps, error: ' + error + ' retry 1/5 will be executed'); 
                adapter.log.info('Will now try to switch TV with MAC: ' + adapter.config.macAddress + ' on');
                wol.wake(adapter.config.macAddress);
            };
            x++;
            startApp(app, x);
        }
        if ( x < 5) {
            setTimeout(function() {x++;             
            adapter.log.info('Error while getInstalledApps, error: ' + error + ' retry '+ x + '/5 will be executed'); 
            startApp(app, x);}, 1000);

        }
        if ( x >= 5) {
            adapter.log.info('Error while getInstalledApps, error: ' + error + ' maximum retries reached'); 
            return error;        
        }
        await wsClose();
    }
};