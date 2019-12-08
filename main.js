"use strict";
const utils =    require(__dirname + '/lib/utils');
const adapter = utils.adapter('samsungTizen');

const webSocket = require('ws');
const wol = require('wake_on_lan');
const req = require('request-promise');

var sendKey = function(key, done) {
      const protocol = adapter.config.protocol;
      const ipAddress = adapter.config.ipAddress;
      const app_name_base64 = (new Buffer("ioBroker")).toString('base64');
      const port = parseFloat(adapter.config.port);
      const token = parseFloat(adapter.config.token);
      let wsUrl;
      if (token === 0) {
      wsUrl = protocol + '://' + ipAddress + ':' + port + '/api/v2/channels/samsung.remote.control?name=' + app_name_base64;  
      }
      if (token > 0) {
      wsUrl = protocol + '://' + ipAddress + ':' + port + '/api/v2/channels/samsung.remote.control?name=' + app_name_base64 + '&token=' + token;
      }
      adapter.log.info('open connection: ' + wsUrl + ', to sendKey: ' + key );
      var ws = new webSocket(wsUrl, {rejectUnauthorized : false}, function(error) {
        done(new Error(error));
      });
      ws.on('error', function (e) {
        adapter.log.info('Error in sendKey: ' + key);
        done(e);
      });
      ws.on('message', function(data, flags) {
        var cmd =  {"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":key,"Option":"false","TypeOfRemote":"SendRemoteKey"}};
        data = JSON.parse(data);
        if(data.event == "ms.channel.connect") {
          ws.send(JSON.stringify(cmd));
          setTimeout(function() {
            ws.close(); 
          }, 1000);
          done(0);
        }
      });
};

var wake = function(done) {
      var macAddress = adapter.config.macAddress;
      wol.wake(macAddress, function(error) {
        if (error) { done(1); }
        else{done(0);}
      });
};

adapter.on('unload', function (callback) {
    try {callback();} catch (e) {callback();}
});
adapter.on('objectChange', function (id, obj) {
    adapter.log.info('objectChange: ' + id + ' ' + JSON.stringify(obj));
});

adapter.on('stateChange', function (id, state) {
    adapter.log.info('stateChange: ' + id + ' ' + JSON.stringify(state));
    
    if ( id === adapter.name + '.' + adapter.instance + '.power') {
	    adapter.log.info(state);
	    adapter.log.info(state.val);
        if(state.val && !state.ack || state.val == "on" && !state.ack) {
			//first try traditional power on key, in case of short standby
			sendKey('KEY_POWER', function(err) {
                  if (err) {
                      adapter.log.info("Got error:" + err);
                  }
              });  
            adapter.log.info("Will now try to switch TV on.");
            wake(function(err) {
                adapter.log.info ("Switch SamsungTV on returned with " + err);     
            });
			
        }
		if(!state.val && !state.ack || state.val == "off" && !state.ack) {
            adapter.log.info("Will now try to switch TV off");
              
            sendKey('KEY_POWER', function(err) {
                 adapter.log.info("Sending Power Key");
                  if (err) {
                      adapter.log.info("Got error:" + err);
                  } else {
                      // command has been successfully transmitted to your tv
                      adapter.log.info('successfully powered off tv');
					  //adapter.setState("Power", "off", false);
                  }
              });  
        }
    }
    
    //Send a key to TV
    if ( id === adapter.name + '.' + adapter.instance + '.sendKey') {       
        sendKey(state.val, function(err) {
                  if (err) {
                      adapter.log.info("Got error:" + err);
                  } else {
                      adapter.log.info('successfully sent key: ' + state.val + ' to tv');
                  }
         });    
          
     }
});

adapter.on('ready', function () {
    main();
});

function main() {

    adapter.setObject('power', {
        type: 'state',
        common: {
            name: 'on/off',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    
    adapter.setObject('sendKey', {
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
    
    adapter.subscribeStates('*');

    
    adapter.on('Power', function() {
        adapter.log.info("on TvOn");
    });
    adapter.log.info('config protocol : ' + adapter.config.protocol);
    adapter.log.info('config ip address  : ' + adapter.config.ipAddress);
    adapter.log.info('config port  : ' + adapter.config.port);
    adapter.log.info('config token  : ' + adapter.config.token);
    adapter.log.info('config mac address : ' + adapter.config.macAddress);
    adapter.log.info('config pollingEndpoint : ' + adapter.config.pollingEndpoint);
    adapter.log.info('config pollingInterval : ' + adapter.config.pollingInterval);
    adapter.log.info('adapter instance : ' + adapter.instance);
	
    const pollingEndpoint = adapter.config.pollingEndpoint;
    const pollingInterval = parseFloat(adapter.config.pollingInterval);
    const ipAddress = adapter.config.ipAddress;
	
    if (pollingInterval > 0) 
    { 
	    setInterval(function(){
            	let powerState;
            	adapter.getState('powerOn', function (err, state) {powerState = state.val;}); 
		req({uri:'http://' + ipAddress + ':' + pollingEndpoint, timeout:10000})
    			.then(()=> {
                    	adapter.log.debug('TV state OK');
			console.log(powerState);
			if(!powerState){
                    	adapter.setState('powerOn', true, true, function (err) {
                     		if (err) adapter.log.error(err);
                	});}
                })
    			.catch(error => {       	   
				adapter.log.debug('TV state NOK');
				console.log(powerState);
				if(powerState){
              			adapter.setState('powerOn', false, true, function (err) {
              			// analyse if the state could be set (because of permissions)
               			if (err) adapter.log.error(err);
                    });}
                })
	    }, pollingInterval * 1000)
    
    }
}
