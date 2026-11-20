// Northline consumer — watch desk lamps.
// Reacts once per received event, not every loop().
// Feed it from the Serial Monitor (paste one JSON line) or press D18.
//
//   D25  red LED     incident.reported priority 1     (220 ohm, then GND)
//   D33  yellow LED  incident.reported priority 2
//   D32  green LED   weather.advisory
//   D23  blue LED    unit.dispatched
//   D19  buzzer +    incident.escalated pageSupervisor, other leg GND
//   D18  button      simulates the next sample event, other leg GND

const int kPinP1 = 25;
const int kPinP2 = 33;
const int kPinWeather = 32;
const int kPinUnit = 23;
const int kPinBuzz = 19;
const int kPinSim = 18;
const unsigned long kDebounceMs = 40;

bool simLast = false;
bool simStable = false;
unsigned long simChangedAt = 0;
int simStep = 0;
String serialLine;

const char *kSamples[] = {
    "{\"type\":\"incident.reported\",\"priority\":10,\"producer\":\"operator\",\"correlationId\":\"inc-esp-1\",\"payload\":{\"incidentId\":\"inc-esp-1\",\"kind\":\"fire\",\"priority\":1,\"district\":\"harbor\",\"summary\":\"Smoke from the fish-smokehouse roof\",\"reporter\":\"Pier panel\"}}",
    "{\"type\":\"incident.reported\",\"priority\":20,\"producer\":\"operator\",\"correlationId\":\"inc-esp-2\",\"payload\":{\"incidentId\":\"inc-esp-2\",\"kind\":\"medical\",\"priority\":2,\"district\":\"campus\",\"summary\":\"Student with a suspected fracture at the gym\",\"reporter\":\"Pier panel\"}}",
    "{\"type\":\"weather.advisory\",\"priority\":60,\"producer\":\"city-simulator\",\"correlationId\":\"weather\",\"payload\":{\"level\":\"warning\",\"summary\":\"High wind on the ridge, gusts past the crane limit\"}}",
    "{\"type\":\"incident.escalated\",\"priority\":8,\"producer\":\"escalation\",\"correlationId\":\"inc-esp-1\",\"payload\":{\"incidentId\":\"inc-esp-1\",\"from\":1,\"to\":1,\"reason\":\"Priority 1 still waiting after 12s\",\"pageSupervisor\":true}}",
    "{\"type\":\"unit.dispatched\",\"priority\":32,\"producer\":\"dispatch\",\"correlationId\":\"inc-esp-1\",\"payload\":{\"incidentId\":\"inc-esp-1\",\"unitId\":\"E2\",\"enrouteAt\":2000,\"onSceneAt\":6000}}",
};

void lampsOff() {
  digitalWrite(kPinP1, LOW);
  digitalWrite(kPinP2, LOW);
  digitalWrite(kPinWeather, LOW);
  digitalWrite(kPinUnit, LOW);
  digitalWrite(kPinBuzz, LOW);
}

bool contains(const String &line, const char *text) {
  return line.indexOf(text) >= 0;
}

void handleEvent(const String &line, const char *from) {
  Serial.print("received ");
  Serial.print(from);
  Serial.print(" ");
  Serial.println(line);

  lampsOff();
  if (contains(line, "\"type\":\"incident.reported\"") && contains(line, "\"priority\":1,")) {
    digitalWrite(kPinP1, HIGH);
    Serial.println("react P1 fire — red lamp");
    return;
  }
  if (contains(line, "\"type\":\"incident.reported\"") && contains(line, "\"priority\":2,")) {
    digitalWrite(kPinP2, HIGH);
    Serial.println("react P2 medical — yellow lamp");
    return;
  }
  if (contains(line, "\"type\":\"weather.advisory\"")) {
    digitalWrite(kPinWeather, HIGH);
    Serial.println("react weather.advisory — green lamp");
    return;
  }
  if (contains(line, "\"pageSupervisor\":true")) {
    digitalWrite(kPinBuzz, HIGH);
    delay(250);
    digitalWrite(kPinBuzz, LOW);
    Serial.println("react incident.escalated — buzzer");
    return;
  }
  if (contains(line, "\"type\":\"unit.dispatched\"")) {
    digitalWrite(kPinUnit, HIGH);
    Serial.println("react unit.dispatched — blue lamp");
    return;
  }
  Serial.println("react none — event name not on this desk");
}

void readSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      serialLine.trim();
      if (serialLine.length() > 0) {
        handleEvent(serialLine, "serial");
      }
      serialLine = "";
    } else if (serialLine.length() < 500) {
      serialLine += c;
    }
  }
}

void pollSimulate() {
  bool down = digitalRead(kPinSim) == LOW;
  if (down != simLast) {
    simLast = down;
    simChangedAt = millis();
  }
  if (millis() - simChangedAt < kDebounceMs || down == simStable) {
    return;
  }
  simStable = down;
  if (!down) {
    return;
  }
  handleEvent(kSamples[simStep], "button");
  simStep = (simStep + 1) % 5;
}

void setup() {
  Serial.begin(115200);
  pinMode(kPinP1, OUTPUT);
  pinMode(kPinP2, OUTPUT);
  pinMode(kPinWeather, OUTPUT);
  pinMode(kPinUnit, OUTPUT);
  pinMode(kPinBuzz, OUTPUT);
  pinMode(kPinSim, INPUT_PULLUP);
  lampsOff();
  Serial.println("consumer ready. Paste one JSON line, or press D18.");
}

void loop() {
  readSerial();
  pollSimulate();
}
