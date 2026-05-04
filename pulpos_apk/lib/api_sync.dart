import 'dart:convert';
import 'package:http/http.dart' as http;
import 'base_datos.dart';

class ApiSync {
  // ⚠️ REEMPLAZA ESTA IP POR LA TUYA (Ej: 192.168.1.15)
  static const String urlServidor =
      'http://192.168.0.102:3000/api/viajes/sincronizar';

  static Future<void> sincronizarViajesPendientes() async {
    try {
      final db = await BaseDatosLocal.instancia.database;

      // 1. Buscamos en SQLite los viajes que NO se han subido (estado = 0)
      final List<Map<String, dynamic>> viajesPendientes = await db.query(
        'viajes', // Asegúrate de que este es el nombre de tu tabla en SQLite
        where: 'estado_sincronizacion = ?',
        whereArgs: [0],
      );

      if (viajesPendientes.isEmpty) {
        print('✅ Todo está al día. No hay viajes nuevos para sincronizar.');
        return;
      }

      print('🚀 Intentando sincronizar ${viajesPendientes.length} viajes...');

      // 2. Empaquetamos los datos en formato JSON
      final bodyJson = jsonEncode(viajesPendientes);

      // 3. Hacemos el disparo (POST) al servidor de Node.js
      final respuesta = await http.post(
        Uri.parse(urlServidor),
        headers: {'Content-Type': 'application/json'},
        body: bodyJson,
      );

      // 4. Si el servidor nos responde OK (200), actualizamos el celular
      if (respuesta.statusCode == 200) {
        // Marcamos esos viajes como "Subidos" (estado = 1) en SQLite
        for (var viaje in viajesPendientes) {
          await db.update(
            'viajes',
            {'estado_sincronizacion': 1},
            where: 'id = ?',
            whereArgs: [viaje['id']],
          );
        }
        print('📥 ¡Sincronización exitosa con la Central!');
      } else {
        print('❌ El servidor rechazó los datos: ${respuesta.body}');
      }
    } catch (e) {
      print('⚠️ Error de conexión (¿Estás en el mismo WiFi?): $e');
    }
  }
}
