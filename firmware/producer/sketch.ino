#include <WiFi.h>
#include <HTTPClient.h>

// Northline producer — pier button panel.
// One JSON line per press (debounced edge), never every loop().
//
// Wire each button between the pin and GND. Pins use INPUT_PULLUP.
//   D13  red     P1 fire      incident.reported
//   D14  yellow  P2 medical   incident.reported
//   D27  blue    weather      weather.advisory
//   D26  green   page         incident.escalated (supervisor)
//
// Wokwi WiFi name is Wokwi-GUEST, empty password, channel 6.
// The same JSON is printed on Serial and POSTed to httpbin.

const char *kSsid = "Wokwi-GUEST";
const char *kPostUrl = "https://httpbin.org/post";
const unsigned long kDebounceMs = 40;

const int kPinFire = 13;
const int kPinMedical = 14;
const int kPinWeather = 27;
const int kPinPage = 26;

struct Button {
  int pin;
  bool lastReading;
  bool stableDown;
  unsigned long changedAt;
};

Button buttons[] = {
    {kPinFire, false, false, 0},
    {kPinMedical, false, false, 0},
    {kPinWeather, false, false, 0},
    {kPinPage, false, false, 0},
};

unsigned long sequence = 0;
bool wifiUp = false;

void postJson(const char *line) {
  if (!wifiUp) {
    return;
  }
  HTTPClient http;
  http.begin(kPostUrl);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST((uint8_t *)line, strlen(line));
  Serial.print("http ");
  Serial.println(code);
  http.end();
}

void emit(const char *type, int rank, const char *producer, const char *correlation, const char *payload) {
  sequence += 1;
  unsigned long now = millis();
  char line[520];
  snprintf(
      line,
      sizeof(line),
      "{\"id\":\"evt-esp-%lu\",\"type\":\"%s\",\"priority\":%d,\"producer\":\"%s\","
      "\"producedAt\":%lu,\"notBefore\":%lu,\"deliveredAt\":0,\"correlationId\":\"%s\","
      "\"sequence\":%lu,\"payload\":%s}",
      sequence, type, rank, producer, now, now, correlation, sequence, payload);
  Serial.println(line);
  postJson(line);
}

void onPress(int pin) {
  if (pin == kPinFire) {
    emit("incident.reported", 10, "operator", "inc-esp-1",
         "{\"incidentId\":\"inc-esp-1\",\"kind\":\"fire\",\"priority\":1,\"district\":\"harbor\","
         "\"summary\":\"Smoke from the fish-smokehouse roof\",\"reporter\":\"Pier panel\"}");
    return;
  }
  if (pin == kPinMedical) {
    emit("incident.reported", 20, "operator", "inc-esp-2",
         "{\"incidentId\":\"inc-esp-2\",\"kind\":\"medical\",\"priority\":2,\"district\":\"campus\","
         "\"summary\":\"Student with a suspected fracture at the gym\",\"reporter\":\"Pier panel\"}");
    return;
  }
  if (pin == kPinWeather) {
    emit("weather.advisory", 60, "city-simulator", "weather",
         "{\"level\":\"warning\",\"summary\":\"High wind on the ridge, gusts past the crane limit\"}");
    return;
  }
  emit("incident.escalated", 8, "escalation", "inc-esp-1",
       "{\"incidentId\":\"inc-esp-1\",\"from\":1,\"to\":1,"
       "\"reason\":\"Priority 1 still waiting after 12s\",\"pageSupervisor\":true}");
}

void poll(Button &button) {
  bool down = digitalRead(button.pin) == LOW;
  if (down != button.lastReading) {
    button.lastReading = down;
    button.changedAt = millis();
  }
  if (millis() - button.changedAt < kDebounceMs || down == button.stableDown) {
    return;
  }
  button.stableDown = down;
  if (down) {
    onPress(button.pin);
  }
}

void setup() {
  Serial.begin(115200);
  for (Button &button : buttons) {
    pinMode(button.pin, INPUT_PULLUP);
  }
  WiFi.mode(WIFI_STA);
  WiFi.begin(kSsid, "", 6);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) {
    delay(100);
  }
  wifiUp = WiFi.status() == WL_CONNECTED;
  Serial.println(wifiUp ? "wifi connected" : "wifi unavailable, serial only");
  Serial.println("ready: D13 P1 fire, D14 P2 medical, D27 weather, D26 supervisor page");
}

void loop() {
  for (Button &button : buttons) {
    poll(button);
  }
}
