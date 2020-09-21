'use strict';

const AWS = require("aws-sdk");
AWS.config.update({
  region: "ap-northeast-1",
});

const MANUFACTURER_NAME = process.env.MANUFACTURER_NAME || 'MyHome Devices';
const IOT_ENDPOINT = process.env.IOT_ENDPOINT || '【AWS IoTのエンドポイント】';
var iot = new AWS.Iot();
var iotdata = new AWS.IotData({endpoint: IOT_ENDPOINT});

const jwt_decode = require('jwt-decode');
const {smarthome} = require('actions-on-google');
const app = smarthome();

const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || "user01";
var agentUserId = DEFAULT_USER_ID;

app.onSync(async (body, headers) => {
  console.info('onSync');
  console.log('onSync body', body);

  var decoded = jwt_decode(headers.authorization);
  console.log(decoded);

  var param_list = {
    thingGroupName: "SmartHome"
  };
  var list = await iot.listThingsInThingGroup(param_list).promise();
  var result = {
    requestId: body.requestId,
    payload: {
      agentUserId: agentUserId,
      devices: []
    }
  };

  for( var i = 0 ; i < list.things.length ; i++ ){
    var param_desc = {
      thingName: list.things[i]
    };
    var desc = await iot.describeThing(param_desc).promise();
    var device = {
      id: list.things[i],
      type: 'action.devices.types.' + desc.attributes.type,
      deviceInfo: {
        manufacturer: MANUFACTURER_NAME,
      },
      willReportState: false,
    };
    switch(device.id){
      case 'switch': {
        device.traits = ['action.devices.traits.OnOff'];
        device.name = { name: "スイッチ" };
        break;
      }
      case 'door': {
        device.traits = ['action.devices.traits.LockUnlock', 'action.devices.traits.OpenClose'];
        device.name = { name: "ドア" };
        device.attributes = {
          discreteOnlyOpenClose: false,
        }
        break;
      }
      case 'illumination': {
        device.traits = ['action.devices.traits.Brightness', 'action.devices.traits.OnOff'];
        device.name = { name: "イルミ" };
        break;
      }
      case 'light': {
        device.traits = ['action.devices.traits.OnOff'];
        device.name = { name: "電気" };
        device.attributes = {
          commandOnlyOnOff: true,
        };
        break;
      }
      case 'aircon': {
        device.traits = ['action.devices.traits.OnOff', 'action.devices.traits.TemperatureSetting'];
        device.name = { name: "エアコン" };
        device.attributes = {
          availableThermostatModes: 'off,heat,cool,auto,dry,on',
          thermostatTemperatureUnit: 'C',
          commandOnlyTemperatureSetting: true,
          commandOnlyOnOff: true,
        };
        device.willReportState = false;
        break;
      }
    }
    result.payload.devices.push(device);
  };

  console.log("onSync result", result);
  return result;
});

app.onQuery(async (body, headers) => {
  console.info('onQuery');
  console.log('onQuery body', body);

  var decoded = jwt_decode(headers.authorization);
  console.log(decoded);

  const {requestId} = body;
  const payload = {
    devices: {}
  };

  for( var i = 0 ; i < body.inputs.length ; i++ ){
    if( body.inputs[i].intent == 'action.devices.QUERY' ){
      for( var j = 0 ; j < body.inputs[i].payload.devices.length ; j++ ){
        var device = body.inputs[i].payload.devices[j];
        var params = {
          thingName: device.id
        };
        var shadow = await iotdata.getThingShadow(params).promise();
        shadow = JSON.parse(shadow.payload);
        var state = shadow.state.reported;
        delete state.welcome;
        state.online = true;
        state.status = 'SUCCESS';
        payload.devices[device.id] = state;
      }
    }
  }

  var result = {
    requestId: requestId,
    payload: payload,
  };

  console.log("onQuery result", result);
  return result;
});

app.onExecute(async (body, headers) => {
  console.info('onExecute');
  console.log('onExecute body', body);

  var decoded = jwt_decode(headers.authorization);
  console.log(decoded);
  
  const {requestId} = body;

  // Execution results are grouped by status
  var ret = {
    requestId: requestId,
    payload: {
      commands: [],
    },
  };
  for( var i = 0 ; i < body.inputs.length ; i++ ){
    if( body.inputs[i].intent == "action.devices.EXECUTE" ){
      for( var j = 0 ; j < body.inputs[i].payload.commands.length ; j++ ){
        var result = {
          ids:[],
          status: 'SUCCESS',
        };
        ret.payload.commands.push(result);

        var devices = body.inputs[i].payload.commands[j].devices;
        var execution = body.inputs[i].payload.commands[j].execution;
        for( var k = 0 ; k < execution.length ; k++ ){
          console.log("command", execution[k].command);
          console.log("params", execution[k].params);
          for( var l = 0 ; l < devices.length ; l++ ){
            result.ids.push(devices[l].id);

            var param_get = {
              thingName: devices[l].id
            };
            var current_shadow = await iotdata.getThingShadow(param_get).promise();
            console.log('current_shadow', current_shadow);

            var state = {};
            switch(execution[k].command){
              case 'action.devices.commands.ThermostatSetMode': {
                state.thermostatMode = execution[k].params.thermostatMode;
                break;
              }
              case 'action.devices.commands.OnOff': {
                state.on = execution[k].params.on;
                break;
              }
              case 'action.devices.commands.mute': {
                state.isMuted = execution[k].params.mute;
                break;
              }
              case 'action.devices.commands.setVolume': {
                state.currentVolume = execution[k].params.volumeLevel;
                break;
              }
              case 'action.devices.commands.LockUnlock': {
                state.isLocked = execution[k].params.lock;
                break;
              }
              case 'action.devices.commands.OpenClose': {
                state.openPercent = execution[k].params.openPercent;
                break;
              }
              case 'action.devices.commands.BrightnessAbsolute': {
                state.brightness = execution[k].params.brightness;
                break;
              }
            }

            var shadow = {
              state: {
                desired: state
              }
            };

            var param_update = {
              thingName: devices[l].id,
              payload: JSON.stringify(shadow)
            };
            console.log('updateThingShadow', param_update);
            await iotdata.updateThingShadow(param_update).promise();
          }
        }
      }
    }
  }

  console.log("onExecute result", ret);
  return ret;
});

app.onDisconnect((body, headers) => {
  console.info('onDisconnect');
  console.log('body', body);

  var decoded = jwt_decode(headers.authorization);
  console.log(decoded);

  // Return empty response
  return {};
});

exports.fulfillment = app;