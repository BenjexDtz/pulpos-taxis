// URL base del backend. Único lugar donde se define.
//
// Se puede cambiar sin editar código al compilar o ejecutar:
//   flutter run --dart-define=API_URL=http://192.168.1.15:3000
//
// En un dispositivo Android no sirve 127.0.0.1: usar la IP de la red local
// o el túnel de ngrok.
const String urlServidor = String.fromEnvironment(
  'API_URL',
  defaultValue: 'https://handclap-powwow-union.ngrok-free.dev',
);
