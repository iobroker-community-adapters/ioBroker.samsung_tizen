"use strict";
const utils =    require(__dirname + '/lib/utils');
const adapter = utils.adapter('samsungTizen');
const wsfunction =    require(__dirname + '/lib/wsfunction');
const polling =    require(__dirname + '/lib/polling');
const objects =    require(__dirname + '/lib/objects');


adapter.on('ready', function () {
main()
});
function main() {
    adapter.log.info(adapter.name + '.' + adapter.instance + ' NIGHTLY started with config : ' + JSON.stringify(adapter.config));
    
    adapter.log.info(adapter.name + '.' + adapter.instance + ' NIGHTLY started with config : ' + JSON.stringify(adapter.config));
}