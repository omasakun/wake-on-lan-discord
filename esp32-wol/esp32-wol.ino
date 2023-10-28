#include "secrets.h"
#include <HTTPClient.h>
#include <WakeOnLan.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiUdp.h>

// https://github.com/a7md0/WakeOnLan/blob/e676bd5b0691436726a12cbd683f19e0d5018530/examples/WakeOnLan-ESP32/WakeOnLan-ESP32.ino
// https://github.com/espressif/arduino-esp32/blob/6d9ebea5008be540aaea5ad3cffc6ceb583692e3/libraries/HTTPClient/examples/BasicHttpsClient/BasicHttpsClient.ino

// https://pki.goog/repository/
// CA certificate of GTS Root R1 (valid until 2036-06-22)
const char *ROOT_CA_CERT =
    "-----BEGIN CERTIFICATE-----\n"
    "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\n"
    "bP6MvPJwNQzcmRk13NfIRmPVNnGuV/u3gm3c\n"
    "-----END CERTIFICATE-----\n";

WiFiUDP UDP;
WakeOnLan WOL(UDP);

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(Secrets::WIFI_SSID, Secrets::WIFI_PASS);

  Serial.print("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" ok.");
}

void setClock() {
  configTime(0, 0, "pool.ntp.org");

  Serial.print("Waiting for NTP...");
  time_t nowSecs = time(nullptr);
  while (nowSecs < 8 * 3600 * 2) {
    delay(500);
    Serial.print(F("."));
    yield();
    nowSecs = time(nullptr);
  }
  Serial.println(" ok.");

  struct tm timeinfo;
  gmtime_r(&nowSecs, &timeinfo);

  Serial.print("Current time: ");
  Serial.print(asctime(&timeinfo));
}

void setup() {
  Serial.begin(115200);

  connectWiFi();
  setClock();

  WOL.setRepeat(3, 100);
  WOL.calculateBroadcastAddress(WiFi.localIP(), WiFi.subnetMask());
}

void loop() {
  WiFiClientSecure *client = new WiFiClientSecure;
  if (client) {
    client->setCACert(ROOT_CA_CERT);

    bool shouldWake = false;

    // Add a scoping block for HTTPClient https to make sure it is destroyed
    // before WiFiClientSecure *client is
    {
      HTTPClient https;
      if (https.begin(*client, Secrets::WORKER_URL_POLL)) {
        https.setAuthorization(Secrets::WORKER_USER, Secrets::WORKER_PASS);

        // Start connection and send HTTP header
        int httpCode = https.GET();

        // httpCode will be negative on error
        if (httpCode > 0) {
          // Server response header has been handled
          String payload = https.getString();
          Serial.printf("Poll: (%d) ", httpCode);
          Serial.println(payload);

          if (payload == "wake") {
            shouldWake = true;
          }
        } else {
          Serial.printf("Poll: HTTP error: %s\n",
                        https.errorToString(httpCode).c_str());
        }

        https.end();
      } else {
        Serial.println("Poll: Unable to connect");
      }
    }

    if (shouldWake) {
      bool success = WOL.sendMagicPacket(Secrets::MAC_ADDRESS);
      Serial.printf("WOL: %s.\n", success ? "success" : "failure");

      String message = success ? "Sure! Your PC will be waked up soon."
                               : "Sorry, Failed to send WOL packet.";

      HTTPClient https;
      if (https.begin(*client, Secrets::WORKER_URL_REPORT)) {
        https.setAuthorization(Secrets::WORKER_USER, Secrets::WORKER_PASS);

        // Start connection and send HTTP header
        int httpCode = https.POST(message);

        if (httpCode > 0) {
          String payload = https.getString();
          Serial.printf("Report: (%d) ", httpCode);
          Serial.println(payload);
        } else {
          Serial.printf("Report: HTTP error: %s\n",
                        https.errorToString(httpCode).c_str());
        }

        https.end();
      } else {
        Serial.println("Report: Unable to connect");
      }
    }

    delete client;
  } else {
    Serial.println("Unable to create client");
  }

  delay(20000);
}
