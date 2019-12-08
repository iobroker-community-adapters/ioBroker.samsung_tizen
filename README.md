![Logo](admin/samsung.png)
# ioBroker.samsungTizen
=================

This adapter is to control samsung tvs with tizenOS


# getToken 

npm install wscat
wscat -n -c wss://tvIp:8002/api/v2/channels/samsung.remote.control?name=aW9Ccm9rZXI=
response example: 
< {"data":{"clients":[{"attributes":{"name":"aW9Ccm9rZXI="},"connectTime":1575818900205,"deviceName":"aW9Ccm9rZXI=","id":"1375fb61-797c-45b0-b0f1-233535918548","isHost":false}],"id":"1375fb61-797c-45b0-b0f1-233535918548","token":"10916644"},"event":"ms.channel.connect"}


