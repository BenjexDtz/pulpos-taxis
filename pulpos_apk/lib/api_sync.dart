import 'dart:math';

final _azar = Random.secure();

// UUID v4: identifica el viaje para que el servidor ignore reenvíos
String nuevoUuid() {
  final b = List<int>.generate(16, (_) => _azar.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-'
      '${h.substring(16, 20)}-${h.substring(20)}';
}

Map<String, dynamic> viajeParaServidor(Map<String, dynamic> viaje) {
  final factorSuperficie = viaje['factor_superficie'];
  final tipoSuperficie =
      viaje['tipo_superficie'] ??
      (factorSuperficie == null
          ? null
          : (factorSuperficie == 1.0 ? 'asfalto' : 'tierra'));

  final body = <String, dynamic>{
    'uuid': viaje['uuid'],
    'distancia_km': viaje['distancia_km'],
    'tiempo_detencion_min': viaje['tiempo_detencion_min'],
    'tarifa_cobrada': viaje['tarifa_total'],
    'fecha_hora_viaje': viaje['fecha_hora'],
    'tipo_superficie': tipoSuperficie,
    'factor_altitud_aplicado': viaje['factor_altitud'],
    'factor_superficie_aplicado': factorSuperficie,
    'costo_base_aplicado': viaje['costo_base_km'],
    'costo_minuto_aplicado': viaje['costo_minuto_detencion'],
    'consumo_litros_aplicado': viaje['consumo_litros_km'],
    'precio_combustible_aplicado': viaje['precio_combustible_bs'],
  };
  body.removeWhere((_, valor) => valor == null);
  return body;
}
