#include <M5StickC.h>
#include <WiFi.h>
#include <ArduinoJson.h>

const char* wifi_ssid = "【WiFiアクセスポイントのSSID】";
const char* wifi_password = "【WiFiアクセスポイントのパスワード】";

const char *udp_report_host = "【Node.jsサーバ(UDP)のIPアドレス】";
#define UDP_REQUEST_PORT  3333 //Node.jsサーバからのUDP受信を待ち受けるポート番号
#define UDP_REPORT_PORT   3333 //Node.jsサーバ(UDP)へUDP送信する先のポート番号

#define LED_PIN     GPIO_NUM_10

const int capacity_request = JSON_OBJECT_SIZE(3);
const int capacity_report = JSON_OBJECT_SIZE(3);
StaticJsonDocument<capacity_request> json_request;
StaticJsonDocument<capacity_report> json_report;
#define BUFFER_SIZE   255
char buffer_request[BUFFER_SIZE];
char buffer_report[BUFFER_SIZE];
bool led_status = false;
bool isPressed = false;
WiFiUDP udp;

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
  M5.begin();
  M5.Lcd.setRotation(3);
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setTextColor(WHITE, BLACK);
  M5.Lcd.println("[M5StickC]");

  Serial.begin(9600);
  Serial.println("setup");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  wifi_connect();

  Serial.println("server stated");
  udp.begin(UDP_REQUEST_PORT);
}

void reportState(){
  json_report.clear();
  json_report["id"] = "switch";
  json_report["onoff"] = led_status;

  serializeJson(json_report, buffer_report, sizeof(buffer_report));
  
  udp.beginPacket(udp_report_host, UDP_REPORT_PORT);
  udp.write((uint8_t*)buffer_report, strlen(buffer_report));
  udp.endPacket();
}

void loop() {
  M5.update();

  int packetSize = udp.parsePacket();
  if( packetSize > 0){
    Serial.println("UDP received");
    int len = udp.read(buffer_request, packetSize);
    DeserializationError err = deserializeJson(json_request, buffer_request, len);
    if( err ){
      Serial.println("Deserialize error");
      Serial.println(err.c_str());
      return;
    }

    const char* id = json_request["id"];
    if( strcmp(id, "query") == 0 ){
      reportState();
    }else if( strcmp(id, "switch") == 0 ){
      led_status = json_request["onoff"];
      digitalWrite(LED_PIN, led_status ? LOW : HIGH);
    }
  }

  if( M5.BtnA.isPressed() ){
    if( !isPressed ){
      isPressed = true;

      Serial.println("BtnA.Released");

      led_status = !led_status;
      digitalWrite(LED_PIN, led_status ? LOW : HIGH);

      reportState();

      delay(100);
    }
  }else if( M5.BtnA.isReleased() ){
    isPressed = false;
  }

  delay(10);
}