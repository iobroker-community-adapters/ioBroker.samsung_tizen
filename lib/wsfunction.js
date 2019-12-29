"use strict";
const utils =    require(__dirname + '/lib/utils');
const wsconn =    require(__dirname + '/lib/wsconn');
const adapter = utils.adapter('samsungTizen');
const wol = require('wake_on_lan');

module.exports = { 
    sendKey,
    getApps,
    startApp
}

async function sendKey(key) {
    let x = 0;
    try{
        await wsconn.connect();
        await wsconn.send({"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":key,"Option":"false","TypeOfRemote":"SendRemoteKey"}})
        return 'sendKey: ' + key + ' successfully sent to tv';
        ;
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
        return 'Error while sendKey: ' + key + ' error: ' + error;
    }
    finally {
        await wsconn.close();
    }
};
async function getApps() {
    let x = 0;
    try{
        await wsconn.connect();
        let data = await wsconn.send({"method":"ms.channel.emit","params":{"event": "ed.installedApp.get", "to":"host"}})
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
        await wsconn.connect();
        let data = await wsconn.send({"method":"ms.channel.emit","params":{"event": "ed.installedApp.get", "to":"host"}})
        data = JSON.parse(data);
        for(let i = 0; i <= data.data.data.length; i++){
            if( app === data.data.data[i].name){
                wsconn.send({"method":"ms.channel.emit","params":{"event": "ed.apps.launch", "to":"host", "data" :{ "action_type" : data.data.data[i].app_type == 2 ? 'DEEP_LINK' : 'NATIVE_LAUNCH',"appId":data.data.data[i].appId}}});
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
        await wsconn.close();
    }
};