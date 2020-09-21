'use strict';

const mqtt = require('mqtt');
const MQTT_HOST = process.env.MQTT_HOST || '【MQTTブローカのURL】';
var mqttClient  = mqtt.connect(MQTT_HOST);

const DEVICE_LIST = ["door", "light", "aircon", "illumination"]; // バーチャルデバイスで処理するデバイス名

mqttClient.on('connect', function () {
  console.log('connected');
  for( var i = 0 ; i < DEVICE_LIST.length ; i++ ){
    console.log("waiting: " + DEVICE_LIST[i]);
    mqttClient.subscribe('$aws/things/' + DEVICE_LIST[i] + '/shadow/update/delta');
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
    console.log(thing, cmd, param, document);
    if( cmd != 'update' )
      return;

    await onUpdate(mqttClient, thing, param, document);
  }catch(error){
    console.error(error);
  }
});

async function updateDocument(client, thingName, state){
  console.log('updateDocument');
  var topic = "$aws/things/" + thingName + '/shadow/update';
  var message = {
    state: {
      reported: state,
      desired: state
    }
  };
  console.log(JSON.stringify(message));
  client.publish(topic, JSON.stringify(message));
}

async function onUpdate(client, thingName, param, document ){
  if( param != 'delta' )
    return;

  var desired_state = document.state;

  var reported_state;
  if( thingName == 'light' ){
    reported_state = await process_light(thingName, desired_state);
  }else
  if( thingName == 'aircon' ){
    reported_state = await process_aircon(thingName, desired_state);
  }else
{
    reported_state = await process_other (thingName, desired_state);
  }

  await updateDocument(client, thingName, reported_state);
}

async function process_other(thingName, desired_state){
  // それぞれのデバイスのtraitsに合わせて処理
  return desired_state;
}

async function process_light(thingName, desired_state){
  //
// desired_state.on=trueまたはfalseの場合の処理
//

  var state = {
    on: desired_state.on
  };
  return state;
}

async function process_aircon(thingName, desired_state){
  if( desired_state.on !== undefined ){
    //
// desired_state.on=trueまたはfalseの場合の処理
//

    var state;
    if( desired_state.on ){
      state = {
        on: true,
        thermostatMode: "auto"
      }
    }else{
      state = {
        on: false,
        thermostatMode: "off"
      }
    }

    return state;
  }else
  if( desired_state.thermostatMode !== undefined ){
    //
    // desired_state.thermostatMode=on または off または cool または heat または auto または dry の場合の処理

    var state;
    if( desired_state.thermostatMode == 'off'){
      state = {
        on: false,
        thermostatMode: "off"
      }
    }else{
      state = {
        on: true,
        thermostatMode: desired_state.thermostatMode
      }
    }

    return state;
  }else{
    throw 'unknown desired';
  }
}
