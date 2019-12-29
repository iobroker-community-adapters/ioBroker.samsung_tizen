"use strict";
const utils =    require('./lib/utils.js');
const adapter = utils.adapter('samsungTizen');
const req = require('request-promise');
const wsfunction =    require('./lib/wsfunction.js');
const objects =    require('./lib/objects.js');


adapter.on('stateChange', async function (id, state) {
    const key = id.split('.');
    if (id === adapter.name + '.' + adapter.instance + '.apps.getInstalledApps'){
        let response = await wsfunction.getApps();
        adapter.log.info(response);
    } 
    if (key[2] === 'apps' && id !== adapter.name + '.' + adapter.instance + '.apps.getInstalledApps'){
        const app = key[3].split('-'); 
        let response = await wsfunction.startApp(app[1]);
        adapter.log.info(response);
        } 
    if (key[3].toUpperCase() === 'SENDKEY'){
        let response = await wsfunction.sendKey(state.val);
        adapter.log.info(response);
    } else if (key[2] === 'control') {
        let response = await wsfunction.sendKey('KEY_' + key[3].toUpperCase());
        adapter.log.info(response);
    }
});

adapter.on('ready', function () {
main()
});
function main() {
    adapter.log.info(adapter.name + '.' + adapter.instance + ' NIGHTLY started with config : ' + JSON.stringify(adapter.config));
    objects.set();
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