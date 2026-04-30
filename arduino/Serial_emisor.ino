const int buttonPin = 2; 

// Variable para recordar cómo estaba el botón hace un instante
int estadoAnteriorBoton = HIGH; 

void setup() {
  Serial.begin(9600);
  pinMode(buttonPin, INPUT_PULLUP); 
}

void loop() {
  // 1. Escuchar a la PC
  if (Serial.available() > 0) {
    String comando = Serial.readStringUntil('\n');
    comando.trim(); // MUY IMPORTANTE: Limpia espacios y enter invisibles
    if (comando == "IDENTIFY") {
      Serial.println("POKEPAD_V1");
    }
  }
  
  // 2. Leer el botón
  int estadoActualBoton = digitalRead(buttonPin);

  // Si antes estaba sin presionar (HIGH) y AHORA está presionado (LOW)
  if (estadoAnteriorBoton == HIGH && estadoActualBoton == LOW) {
    Serial.println("BOTON_1"); // Enviamos la orden
    delay(50); // Debounce de 50ms es suficiente para un switch mecánico
  }

  // Actualizamos el recuerdo del botón para la próxima vuelta del loop
  estadoAnteriorBoton = estadoActualBoton;
}