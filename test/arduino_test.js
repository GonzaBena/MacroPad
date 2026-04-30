const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

async function testArduino() {
  try {
    // 1. Listar puertos disponibles
    const ports = await SerialPort.list();
    if (ports.length === 0) {
      console.log("❌ No se detectaron puertos seriales. Por favor conecta tu Arduino.");
      return;
    }
    
    console.log("🔍 Puertos detectados:");
    ports.forEach(p => console.log(` - ${p.path} (${p.manufacturer || 'Desconocido'})`));

    // 2. Seleccionar el puerto (priorizamos COM3 si existe, si no tomamos el primero)
    const portName = ports.find(p => p.path === 'COM3') ? 'COM3' : ports[0].path;
    console.log(`\n🔌 Conectando a ${portName} a 9600 baudios...`);

    const port = new SerialPort({
      path: portName,
      baudRate: 9600
    });

    // 3. Crear un parser para leer línea por línea
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    port.on('open', () => {
      console.log('✅ Puerto abierto. Esperando 2 segundos a que el Arduino se reinicie...');
      
      // Al abrir el puerto serial, el Arduino suele reiniciarse. Le damos 2 segundos.
      setTimeout(() => {
        console.log('📡 Enviando comando: "IDENTIFY"');
        port.write('IDENTIFY\n');
      }, 2000);
    });

    // 4. Escuchar las respuestas del Arduino
    parser.on('data', (data) => {
      const response = data.trim(); // Quitamos espacios o saltos de línea extra (\r)
      console.log(`[Arduino]: ${response}`);
      
      if (response === 'POKEPAD_V1') {
        console.log('✅ ¡Éxito! El dispositivo respondió a la identificación correctamente.');
        console.log('👉 Ahora presiona el botón en tu placa Arduino para probar la lectura...');
      } else if (response === 'PRESIONADO') {
        console.log('🟢 ¡Botón presionado detectado correctamente!');
      }
    });

    port.on('error', function(err) {
      console.log('❌ Error en el puerto serial: ', err.message);
    });

  } catch (error) {
    console.error("❌ Ocurrió un error al iniciar el test:", error);
  }
}

testArduino();
