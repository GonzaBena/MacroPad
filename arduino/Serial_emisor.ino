const int buttonPin = 2; // Pin donde conectas el switch

void setup() {
  Serial.begin(9600);
  // Usamos INPUT_PULLUP para no necesitar resistencias externas
  pinMode(buttonPin, INPUT_PULLUP);
}

void loop() {

  // Escuchar si la PC pregunta "¿Quién eres?"

  if (Serial.available() > 0) {
    String comando = Serial.readStringUntil('\n');
    if (comando == "IDENTIFY") {
      Serial.println("POKEPAD_V1"); // Esta es tu firma ahora
    }
  }

  int buttonState = digitalRead(buttonPin);
  // Si el estado es LOW, significa que presionaste el botón
  if (buttonState == LOW) {
    Serial.println("PRESIONADO");
    delay(200); // Un pequeño delay para evitar rebotes (debounce)
  }
}