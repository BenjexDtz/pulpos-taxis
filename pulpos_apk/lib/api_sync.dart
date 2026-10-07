Map<String, dynamic> viajeParaServidor(Map<String, dynamic> viaje) {
  final factorSuperficie = viaje['factor_superficie'];
  final tipoSuperficie =
      viaje['tipo_superficie'] ??
      (factorSuperficie == null
          ? null
          : (factorSuperficie == 1.0 ? 'asfalto' : 'tierra'));

  final body = <String, dynamic>{
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
