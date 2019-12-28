"use strict";
const utils =    require(__dirname + '/lib/utils');
const adapter = utils.adapter('samsungTizen');

const WebSocket = require('ws');
const wol = require('wake_on_lan');
const req = require('request-promise');

let sendKey = (key, done) => {
    const token = parseFloat(adapter.config.token);
    let wsUrl = adapter.config.protocol + '://' + adapter.config.ipAddress + ':' + adapter.config.port + '/api/v2/channels/samsung.remote.control?name=' + (new Buffer("ioBroker")).toString('base64');
    if (token > 0) {wsUrl = wsUrl + '&token=' + token;}
    adapter.log.info('open connection: ' + wsUrl + ', to sendKey: ' + key );
    var ws = new WebSocket(wsUrl, {rejectUnauthorized : false}, function(error) {
      done(new Error(error));
    ws.on('open', function open() {
        setTimeout(function(){
        ws.send(JSON.stringify({"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":key,"Option":"false","TypeOfRemote":"SendRemoteKey"}}));
        }), 1000});
    ws.on('message', function incoming(data) {
        adapter.log.info(data);
        setTimeout(function() {
            ws.close(); 
            adapter.log.info('close connection: ' + wsUrl + ', to sendKey: ' + key );
            }, 1000);
        done(0);
        });
    });
    ws.on('error', function (e) {
        setTimeout(function() {
            ws.close(); 
            adapter.log.info('close connection: ' + wsUrl + ', to sendKey: ' + key );
            }, 1000);
        done(e);
    });
};

let getApps = (done) => {
    const token = parseFloat(adapter.config.token);
    let wsUrl = adapter.config.protocol + '://' + adapter.config.ipAddress + ':' + adapter.config.port + '/api/v2/channels/samsung.remote.control?name=' + (new Buffer("ioBroker")).toString('base64');
    if (token > 0) {wsUrl = wsUrl + '&token=' + token;}
    adapter.log.info('open connection: ' + wsUrl + ', to get installed apps');
    var ws = new WebSocket(wsUrl, {rejectUnauthorized : false}, function(error) {
      done(new Error(error));
    ws.on('open', function open() {
        setTimeout(function(){
        ws.send(JSON.stringify({"method":"ms.channel.emit","params":{"event": "ed.installedApp.get", "to":"host"}}));
        }), 1000});
    ws.on('message', function incoming(data) {
        adapter.log.info(data);
        setTimeout(function() {
            ws.close();
            adapter.log.info('close connection: ' + wsUrl + ', to sendKey: ' + key );
            }, 1000);
        done(0);
        });
    });
    ws.on('error', function (e) {
        setTimeout(function() {
            ws.close(); 
            adapter.log.info('close connection: ' + wsUrl + ', to sendKey: ' + key );
            }, 1000);
        done(e);
    });
};

adapter.on('stateChange', function (id, state) {
  const key = id.split('.');
  if (id === adapter.name + '.' + adapter.instance + '.settings.getInstalledApps'){
    getApps(function(err) {
        if (err) {
            adapter.log.info('Error in getInstalledApps error: ' + err);
        } else {
              adapter.log.info('getInstalledApps successfully sent to tv');
        }})  } 
  if (key[3].toUpperCase() === 'SENDKEY'){
    sendKey(state.val, function(err) {
      if (err) {
          adapter.log.info('Error in sendKey: ' + state.val + ' error: ' + err);
      } else {
            adapter.log.info('sendKey: ' + state.val + ' successfully sent to tv');
      }});
  } else if (key[2] === 'control') {
    sendKey('KEY_' + key[3].toUpperCase(), function(err) {
      if (err && key[3].toUpperCase() === 'POWER'){
        adapter.log.info('Will now try to switch TV with MAC: ' + adapter.config.macAddress + ' on');
          wol.wake(adapter.config.macAddress, function(error) {
            if (error) {adapter.log.error('Cannot wake TV with MAC: ' + adapter.config.macAddress + ' error: ' + error )}
            else {adapter.log.info('WakeOnLAN successfully executed for MAC: ' + adapter.config.macAddress)}
          });
      }
      if (err) {
        adapter.log.info('Error in sendKey: KEY_' + key[3].toUpperCase() + ' error: ' + err);
      } else {
        adapter.log.info('sendKey: KEY_' + key[3].toUpperCase() + ' successfully sent to tv');
        }
      });
    }

});

function powerOnStatePolling(){
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

adapter.on('ready', function () {
    main();
});

function main() {
    adapter.setObject('settings.getInstalledApps', {
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
    
    adapter.subscribeStates('control.*');
    adapter.subscribeStates('settings.*');
		
    if (parseFloat(adapter.config.pollingInterval) > 0){powerOnStatePolling();}

    adapter.log.info(adapter.name + '.' + adapter.instance + ' NIGHTLY started with config : ' + JSON.stringify(adapter.config));
}
