import log from 'electron-log/main';
import { app } from 'electron';

log.initialize();

log.transports.file.level = 'info';
log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB — rota automáticamente
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// En desarrollo también se muestran mensajes debug en consola
log.transports.console.level = app.isPackaged ? false : 'debug';

// Captura uncaught exceptions y promise rejections sin salida al log de errores
log.errorHandler.startCatching({ showDialog: false });

export default log;
