'use strict';

const AWS = require("aws-sdk");
AWS.config.update({
  region: "ap-northeast-1",
});
var iot = new AWS.Iot();

const mqtt = require('mqtt');
const {smarthome} = require('actions-on-google');

const JWT_FILE_PATH = process.env.JWT_FILE_PATH || '【サービスアカウントキーファイル名】';
const jwt = require(JWT_FILE_PATH);
const app = smarthome({
  jwt: jwt
});

const MQTT_HOST = process.env.MQTT_HOST || '【MQTTブローカのURL】';
var mqttClient  = mqtt.connect(MQTT_HOST);

const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || "user01";
var agentUserId = DEFAULT_USER_ID;

var requestId = 0;

mqttClient.on('connect', async () => {
  console.log('connected');
  var param_list = {
    thingGroupName: "SmartHome"
  };
  var list = await iot.listThingsInThingGroup(param_list).promise();
  for( var i = 0 ; i < list.things.length ; i++ ){
    console.log( 'waiting: ' + list.things[i]);
    mqttClient.subscribe('$aws/things/' + list.things[i] + '/shadow/update/documents');
  }
});

mqttClient.on('message', async (topic, message) =>{
  try{
    var tps = topic.split('/');
    if( tps.length < 6 )
      return;
    if( tps[0] != '$aws' || tps[1] != 'things' || tps[3] != "shadow" )
      return;
    
    var thing = tps[2];
    var cmd = tps[4];
    var param = tps[5];
    var document = JSON.parse(message.toString());
    console.log(thing, cmd, param, JSON.stringify(document));
    if( cmd != 'update' )
      return;

    await onUpdate(mqttClient, thing, param, document);
  }catch(error){
    console.error(error);
  }
});

async function onUpdate(client, thingName, param, document ){
  if( param != 'documents' )
    return;

  var reported = document.current.state.reported;
  delete reported.welcome;
  await reportState(thingName, reported);
}

async function reportState(id, state){
  console.log("reportstate", state);
  var message = {
    requestId: String(++requestId),
    agentUserId: agentUserId,
    payload: {
      devices: {
        states:{
          [id]: state
        }
      }
    }
  };

  console.log("reportstate", JSON.stringify(message));
  await app.reportState(message);

  return message;
} 