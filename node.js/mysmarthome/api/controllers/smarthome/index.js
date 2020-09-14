'use strict';

const HELPER_BASE = process.env.HELPER_BASE || '../../helpers/';
const Response = require(HELPER_BASE + 'response');

const JWT_FILE_PATH = process.env.JWT_FILE_PATH || '【サービスアカウントキーファイル名】';
const DEVICE_ADDRESS = '【ESP32のIPアドレス】';
const DEVICE_PORT = 3333; // UDP受信するポート番号

const dgram = require('dgram');
const udp = dgram.createSocket('udp4');

const jwt_decode = require('jwt-decode');
const {smarthome} = require('actions-on-google');

const jwt = require(JWT_FILE_PATH);
const app = smarthome({
  jwt: jwt
});

var states_switch = {
  on: false
};

var requestId = 0;

const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || "user01";
var agentUserId = DEFAULT_USER_ID;

executeDevice('query');

app.onSync((body, headers) => {
  console.info('onSync');
  console.log('onSync body', body);

  var decoded = jwt_decode(headers.authorization);
  console.log(decoded);

  var result = {
    requestId: body.requestId,
    payload: {
      agentUserId: agentUserId,
      devices: [
        {
          id: 'switch',
          type: 'action.devices.types.SWITCH',
          traits: [
            'action.devices.traits.OnOff',
          ],
          name: {
            defaultNames: ['MyHome Switch'],
            name: 'スイッチ',
          },
          deviceInfo: {
            manufacturer: 'MyHome Devices',
          },
          willReportState: true,
        },
      ],
    },
  };

  executeDevice('query');

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
        if( device.id == 'switch' ){
          payload.devices.switch = {
            on: states_switch.on,
            online: true,
            status: "SUCCESS"
          };
        }else
        {
          console.log('not supported');
        }
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
          if( execution[k].command == "action.devices.commands.OnOff" ){
            for( var l = 0 ; l < devices.length ; l++ ){
              if( devices[l].id == "switch"){
                result.ids.push(devices[l].id);
                states_switch.on = execution[k].params.on;

                await executeDevice(devices[l].id);
                await reportState(devices[l].id);
              }
            }
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

async function executeDevice(id){
  var message;
  if( id == 'switch' ){
    message = {
      id: id,
      onoff: states_switch.on,
    };
  }else if( id == 'query' ){
    message = {
      id: 'query'
    };
  }else{
    throw 'unknown id';
  }
  var data = Buffer.from(JSON.stringify(message));
  return new Promise((resolve, reject) =>{
    udp.send(data, 0, data.length, DEVICE_PORT, DEVICE_ADDRESS, (error, bytes) =>{
      if( error ){
        console.error(error);
        return reject(error);
      }

      resolve(bytes);
    });
  });
}

async function reportState(id){
  var state;
  if( id == 'switch'){
    state = {
      requestId: String(++requestId),
      agentUserId: agentUserId,
      payload: {
        devices: {
          states:{
            [id]: {
              on: states_switch.on
            }
          }
        }
      }
    };
  }else{
    throw 'unknown id';
  }
  console.log("reportstate", state);
  await app.reportState(state);

  return state;
} 

exports.handler = async (event, context, callback) => {
	var body = JSON.parse(event.body);
  console.log(body);
  
  if( event.path == '/reportstate'){
    try{
      if( body.id == 'switch'){
        states_switch.on = body.onoff;
      }
      var res = await reportState(body.id);
      console.log(res);
    return new Response({ message: 'OK' });
    }catch(error){
      console.error(error);
      var response = new Response();
      response.set_error(error);
      return response;
    }
  }
};
