![Logo](admin/samsung.png)
# ioBroker.samsungTizen
=====================

This adapter is to control samsung tvs with tizenOS (>=2016).

## How to install

open iobroker admin in a browser window and go to the adapters tab

1. click on the github icon (install from custom URL)
![install1](images/install1.png)
2. enter this github URL https://github.com/dahuby/iobroker.samsungTizen/tarball/master
3. click on install
![install2](images/install2.png)
4. go back to the adapters tab and search "Samsung Tizen"
5. click on "+" to add a new instance
![install3](images/install3.png)
6. configure the adapter 
![install4](images/install4.png)

## Configuration

How to configure this adapter

### Protocol

Protocol for the websocket connection to your TV.
possible values are http or wss, on newer devices use wss

### IP Address 

IP Address of your Samsung TV

### Port

Port for the websocket connection to your TV.
8001 unsecure port
8002 secure port

### Token 

Token for a secure connection to your TV. 
can be deactivated with value "0"
#### How to get a token 

Install "wscat" on the device where ioBroker is running with following command:
```sh
npm install wscat
```
Turn TV on and query the token via websocket connection 
```sh
wscat -n -c wss://tvIp:8002/api/v2/channels/samsung.remote.control?name=aW9Ccm9rZXI=
```
a pop up appears on your TV that must be accepted.
take the token from the returned json response
```json
{"name":"aW9Ccm9rZXI="},"connectTime":1575818900205,"deviceName":"aW9Ccm9rZXI=","id":"12345678-797c-45b0-b0f1-233535918548","isHost":false}],"id":"12345678-797c-45b0-b0f1-233535918548","token":"10916644"},"event":"ms.channel.connect"}
```

### MAC Address

MAC Address of your Samsung TV, will be used for WakeOnLAN. 
Does only work if your TV is connected per wire and not wireless.
If your TV is wireless connected it can only powered on from shortStandby.
wakeOnLan can be deactivated with value "0"
### TV state polling

Work on my 2018 model( NU Series7 )

#### Polling Port

a port to get the power state 
default: 9110
known available ports: 9110, 9197

#### Polling Interval 

how often the poll request shall be sent
default: 60 seconds
can be deactivated with value "0"

##How to use

###Control
#### Send a single key
to send a single key click the button under e.g. samsungTizen.0.control.KEY_MUTE

#### Send a key for a not defined button
you can send a custom (not defined) key with the samsungTizen.0.control.sendKey object.
Enter the key what you want to send e.g. KEY_POWER.

#### Send multiple keys in a single command 
to send multiple key in a single command use the samsungTizen.0.control.sendCmd object.
enter keys separated with "," e.g. KEY_POWER,KEY_HDMI,KEY_VOLUP.

###APPS
#### Load installed Apps
to load the installed Apps click on samsungTizen.0.apps.getInstalledApps button.
After that, a separate object with the name start_app_name is created for each installed app.

#### Start App
you can start an app with a click on the samsungTizen.0.apps.start_app_name object.

### Power State 

if you have the power state polling configured as mentioned above, you get the under samsungTizen.0.powerOn the state true if your tv is on or false if it is off.

