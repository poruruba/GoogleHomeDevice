//#define M5CORE2
#define M5STICKC

#ifdef M5CORE2
#include <M5Core2.h>
#include <Fonts/EVA_20px.h>
#endif
#ifdef M5STICKC
#include <M5StickC.h>
#endif

//#define DEVICE_ONOFF
#define DEVICE_LOCK

#include <WiFi.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>

const char* wifi_ssid = "【WiFiアクセスポイントのSSID】";
const char* wifi_password = "【WiFiアクセスポイントのパスワード】";

#define DISP_FORE_COLOR   WHITE
#define DISP_BACK_COLOR   BLACK

#define DEVICE_NAME "switch" // ★DEVICEの名前

#define NOTIFY(a) 
const char* mqtt_server = "【MQTTブローカのホスト名】"; // MQTTのIPかホスト名
const int mqtt_port = 1883;       // MQTTのポート
const char* topic_notify = "$aws/things/" DEVICE_NAME "/shadow/update/delta"; // 受信用トピック名
const char* topic_report = "$aws/things/" DEVICE_NAME "/shadow/update"; // 送信用トピック名

#ifdef M5CORE2
#define MQTT_CLIENT_NAME  "M5Core2" // MQTTサーバ接続時のクライアント名
#endif
#ifdef M5STICKC
#define MQTT_CLIENT_NAME  "M5StickC" // MQTTサーバ接続時のクライアント名
#endif

WiFiClient wifiClient;
PubSubClient client(wifiClient);

#define MQTT_BUFFER_SIZE  1024 // MQTT送受信のバッファサイズ

// ★DEVICEごとの定義
#define NUM_OF_ATTR   1
#define LED_PIN     GPIO_NUM_10
typedef struct{
  bool on;
} DEVICE_STATUS;
DEVICE_STATUS device_status = { false };

const int capacity_notify = JSON_OBJECT_SIZE(4) + 3*JSON_OBJECT_SIZE(NUM_OF_ATTR);
const int capacity_report = JSON_OBJECT_SIZE(1) + JSON_OBJECT_SIZE(2) + 2*JSON_OBJECT_SIZE(NUM_OF_ATTR);
StaticJsonDocument<capacity_notify> json_notify;
StaticJsonDocument<capacity_report> json_report;
#define BUFFER_SIZE   MQTT_BUFFER_SIZE
char buffer_notify[BUFFER_SIZE];
char buffer_report[BUFFER_SIZE];

bool isPressed = false;

void updateState(){
  json_report.clear();
  JsonObject state = json_report.createNestedObject("state");
  JsonObject desired = state.createNestedObject("desired");
  JsonObject reported = state.createNestedObject("reported");

  // ★DEVICEごとの処理
  {
    desired["on"] = device_status.on;
    reported["on"] = device_status.on;
  }

  serializeJson(json_report, Serial);
  Serial.println("");

  serializeJson(json_report, buffer_report, sizeof(buffer_report));
  client.publish(topic_report, buffer_report);
}

void mqtt_callback(char* topic, byte* payload, unsigned int length) {
  Serial.println("MQTT received");

  // JSONをパース
  DeserializationError err = deserializeJson(json_notify, payload, length);
  if( err ){
    Serial.println("Deserialize error");
    Serial.println(err.c_str());
    return;
  }
  serializeJson(json_notify, Serial);
  Serial.println("");

  // ★DEVICEごとの処理
  {
    if( json_notify["state"].containsKey("on") ){
      device_status.on = json_notify["state"]["on"];
    }
    digitalWrite(LED_PIN, device_status.on ? LOW : HIGH);
  }

  updateState();
}

void wifi_connect(void){
  Serial.println("");
  Serial.print("WiFi Connenting");

  WiFi.begin(wifi_ssid, wifi_password);
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(1000);
  }
  Serial.println("");
  Serial.print("Connected : ");
  Serial.println(WiFi.localIP());
  M5.Lcd.println(WiFi.localIP());
}

void setup() {
#ifdef M5CORE2
  M5.begin(true, false, true, true);
  M5.Lcd.setTextSize(2);
#endif
#ifdef M5STICKC
  M5.begin(true, true, true);
  M5.Lcd.setRotation(3);
  M5.Lcd.setTextSize(1);
#endif

  Serial.begin(9600);
  Serial.println("");
  Serial.println("Now Initializing");

  M5.Lcd.fillScreen(DISP_BACK_COLOR);
  M5.Lcd.setTextColor(DISP_FORE_COLOR);

  // ★DEVICEごとの処理
  {
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, HIGH);
  }

  wifi_connect();

  // バッファサイズの変更
  client.setBufferSize(MQTT_BUFFER_SIZE);
  // MQTTコールバック関数の設定
  client.setCallback(mqtt_callback);
  // MQTTブローカに接続
  client.setServer(mqtt_server, mqtt_port);

  M5.Lcd.println("MQTT Connect");
}

void loop() {
  M5.update();
  client.loop();

  // MQTT未接続の場合、再接続
  while(!client.connected() ){
    Serial.println("Mqtt Reconnecting");
    if( client.connect(MQTT_CLIENT_NAME) ){
      // MQTT Subscribe
      client.subscribe(topic_notify);
      Serial.println("Mqtt Connected and Subscribing");
      break;
    }
    delay(1000);
  }

  if( M5.BtnA.isPressed() ){
    if( !isPressed ){
      isPressed = true;

      Serial.println("BtnA.Released");

      // ★DEVICEごとの処理
      {
        device_status.on = !device_status.on;
        digitalWrite(LED_PIN, device_status.on ? LOW : HIGH);
      }

      updateState();

      delay(100);
    }
  }else if( M5.BtnA.isReleased() ){
    isPressed = false;
  }

  delay(10);
}