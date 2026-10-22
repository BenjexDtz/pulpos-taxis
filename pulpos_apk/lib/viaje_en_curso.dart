import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'calculadora.dart';

// Lo necesario para retomar un viaje si la app se cierra; sus puntos ya están en SQLite
// y el taxímetro se recalcula con ellos y con los parámetros de cuando empezó
class ViajeEnCurso {
  const ViajeEnCurso({
    required this.uuid,
    required this.choferId,
    required this.inicio,
    required this.parametros,
  });

  static const _clave = 'viaje_en_curso';

  final String uuid;
  final int choferId;
  final DateTime inicio;
  final ParametrosTopograficos parametros;

  Future<void> guardar() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _clave,
      jsonEncode({
        'uuid': uuid,
        'chofer_id': choferId,
        'inicio': inicio.toIso8601String(),
        'parametros': parametros.toJson(),
      }),
    );
  }

  static Future<ViajeEnCurso?> leer() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final texto = prefs.getString(_clave);
      if (texto == null) return null;
      final datos = jsonDecode(texto) as Map<String, dynamic>;
      return ViajeEnCurso(
        uuid: datos['uuid'] as String,
        choferId: datos['chofer_id'] as int,
        inicio: DateTime.parse(datos['inicio'] as String),
        parametros: ParametrosTopograficos.fromJson(datos['parametros'] as Map<String, dynamic>),
      );
    } catch (_) {
      return null;
    }
  }

  static Future<void> borrar() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_clave);
  }
}
