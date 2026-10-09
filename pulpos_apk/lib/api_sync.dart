import 'dart:math';

import 'calculadora.dart';

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

// Punto GPS que entró en el cálculo; la superficie es la marcada al llegar a él
class PuntoRuta {
  const PuntoRuta(this.lat, this.lng, this.segundos, this.superficie);

  final double lat;
  final double lng;
  final int segundos;
  final Superficie superficie;

  factory PuntoRuta.desdeSqlite(Map<String, dynamic> fila) => PuntoRuta(
    (fila['lat'] as num).toDouble(),
    (fila['lng'] as num).toDouble(),
    fila['segundos'] as int,
    fila['superficie'] == 1 ? Superficie.tierra : Superficie.asfalto,
  );

  Map<String, Object> paraSqlite(String uuidViaje, int orden) => {
    'viaje_uuid': uuidViaje,
    'orden': orden,
    'lat': lat,
    'lng': lng,
    'segundos': segundos,
    'superficie': superficie == Superficie.tierra ? 1 : 0,
  };

  // 6 decimales ≈ 10 cm: no altera la distancia y achica el envío
  List<Object> paraServidor() => [
    (lat * 1e6).round() / 1e6,
    (lng * 1e6).round() / 1e6,
    segundos,
    superficie == Superficie.tierra ? 1 : 0,
  ];
}

Map<String, dynamic> viajeParaServidor(
  Map<String, dynamic> viaje, {
  List<PuntoRuta> ruta = const [],
}) {
  final factorSuperficie = viaje['factor_superficie'];
  final tipoSuperficie =
      viaje['tipo_superficie'] ??
      (factorSuperficie == null
          ? null
          : (factorSuperficie == 1.0 ? 'asfalto' : 'tierra'));

  final body = <String, dynamic>{
    'uuid': viaje['uuid'],
    'distancia_km': viaje['distancia_km'],
    'km_asfalto': viaje['km_asfalto'],
    'km_tierra': viaje['km_tierra'],
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
  if (ruta.isNotEmpty) body['ruta'] = ruta.map((p) => p.paraServidor()).toList();
  return body;
}
