"use strict";
const utils =    require('./utils.js');
const adapter = utils.adapter('samsungTizen');

function set(){
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
}
exports.set = set; 