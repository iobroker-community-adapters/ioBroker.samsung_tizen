/**
 *
 * samsung2016 adapter
 *
 *
 *  file io-package.json comments:
 *
 *  {
 *      "common": {
 *          "name":         "template",                  // name has to be set and has to be equal to adapters folder name and main file name excluding extension
 *          "version":      "0.0.0",                    // use "Semantic Versioning"! see http://semver.org/
 *          "title":        "Node.js template Adapter",  // Adapter title shown in User Interfaces
 *          "authors":  [                               // Array of authord
 *              "name <mail@template.com>"
 *          ]
 *          "desc":         "template adapter",          // Adapter description shown in User Interfaces. Can be a language object {de:"...",ru:"..."} or a string
 *          "platform":     "Javascript/Node.js",       // possible values "javascript", "javascript/Node.js" - more coming
 *          "mode":         "daemon",                   // possible values "daemon", "schedule", "subscribe"
 *          "schedule":     "0 0 * * *"                 // cron-style schedule. Only needed if mode=schedule
 *          "loglevel":     "info"                      // Adapters Log Level
 *      },
 *      "native": {                                     // the native object is available via adapter.config in your adapters code - use it for configuration
 *          "test1": true,
 *          "test2": 42
 *      }
 *  }
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

// you have to require the utils module and call adapter function
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
var adapter = utils.adapter('samsung2016');

var webSocket = require('ws');
var wol = require('wake_on_lan');
var request = require('request');



var sendKey = function(key, done) {
      var ipAddress = adapter.config.ipAddress;
      var app_name_base64 = (new Buffer("ioBroker")).toString('base64');
      
      adapter.log.info("Trying ipAddress " + ipAddress);
      adapter.log.info("Try to open a websocket connection to " + ipAddress);
      var ws = new webSocket('http://' + ipAddress + ':8001/api/v2/channels/samsung.remote.control?name=' + app_name_base64, function(error) {
        done(new Error(error));
      });
      ws.on('error', function (e) {
        adapter.log.info('Error in sendKey WebSocket communication');
        done(e);
      });
      ws.on('message', function(data, flags) {
        var cmd =  {"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":key,"Option":"false","TypeOfRemote":"SendRemoteKey"}};
        data = JSON.parse(data);
        if(data.event == "ms.channel.connect") {
          adapter.log.info('websocket connect');
          ws.send(JSON.stringify(cmd));
          setTimeout(function() {
            ws.close(); 
            adapter.log.info('websocket closed');
          }, 1000);
          done(0);
        }
      });
};

var wake = function(done) {
      var macAddress = adapter.config.macAddress;
      adapter.log.info("Sending wol command");
      wol.wake(macAddress, function(error) {
        if (error) { done(1); }
        else { done(0); }
      });
};

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));
    
    // Switch TV on or off
    if ( id == 'samsung2016.0.tvOn') {
        if(state.val) {
            adapter.log.info("Will now try to switch TV on.);
            wake(function(err) {
                console.log ("Switch SamsungTV on returned with " + err);     
            });
        } else {
            adapter.log.info("Will now try to switch TV off");
              
            sendKey('KEY_POWER', function(err) {
                 adapter.log.info("Sending Power Key");
                  if (err) {
                      adapter.log.info("Got error:" + err);
                  } else {
                      // command has been successfully transmitted to your tv
                      adapter.log.info('successfully powered off tv');
                  }
              });  
        }
    }
    
    //Send a key to TV
    
    if ( id == 'samsung2016.0.sendKey') {       
        adapter.log.info("Will now send key " + state + " to TV");
     }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});





function main() {

    adapter.setObject('tvOn', {
        type: 'state',
        common: {
            name: 'tvOn',
            type: 'boolean',
            role: 'button'
        },
        native: {}
    });
    
    adapter.setObject('sendKey', {
        type: 'state',
        common: {
            name: 'sendKey',
            type: 'val',
            role: 'button'
        },
        native: {}
    });
    
    adapter.subscribeStates('*');

    
    adapter.on('tvOn', function() {
        adapter.log.info("on TvOn");
    });
    
    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.info("Entered main");
    adapter.log.info('config ip address  : ' + adapter.config.ipAddress);
    adapter.log.info('config mac address : ' + adapter.config.macAddress);
      
    //  this.ipAddress = adapter.config.ipAddress;
    //  this.macAddress = adapter.config.macAddress;

}
