import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

// ─── Modelo de parámetros ─────────────────────────────────────────────────────
class ParametrosTopograficos {
  final int id;
  final String zonaCiudad;

  // Componente económico base
  final double costoBaseKm;

  // Componente combustible
  final double consumoLitrosKm; // Cl — litros por km del vehículo
  final double precioCombustibleBs; // Pc — Bs por litro de gasolina

  // Factores topográficos
  final double factorAltitud;
  final double factorSuperficie; // FR para tierra/barro
  final double costoMinutoDetencion;

  const ParametrosTopograficos({
    required this.id,
    required this.zonaCiudad,
    required this.costoBaseKm,
    required this.consumoLitrosKm,
    required this.precioCombustibleBs,
    required this.factorAltitud,
    required this.factorSuperficie,
    required this.costoMinutoDetencion,
  });

  /// Costo de combustible por km: Cl × Pc
  /// Este valor se multiplica luego por FH × FR (igual que el costo base)
  double get costoCombustibleKm => consumoLitrosKm * precioCombustibleBs;

  /// Costo variable total por km antes de aplicar factores topográficos
  /// = Cb + Cl × Pc
  double get costoVariableKm => costoBaseKm + costoCombustibleKm;

  factory ParametrosTopograficos.fromJson(Map<String, dynamic> json) {
    return ParametrosTopograficos(
      id: json['id'],
      zonaCiudad: json['zona_ciudad'],
      costoBaseKm: double.parse(json['costo_base_km'].toString()),
      consumoLitrosKm: double.parse(
        (json['consumo_litros_km'] ?? 0.100).toString(),
      ),
      precioCombustibleBs: double.parse(
        (json['precio_combustible_bs'] ?? 6.96).toString(),
      ),
      factorAltitud: double.parse(json['factor_altitud'].toString()),
      factorSuperficie: double.parse(json['factor_superficie'].toString()),
      costoMinutoDetencion: double.parse(
        json['costo_minuto_detencion'].toString(),
      ),
    );
  }

  // Valores por defecto si el servidor no responde (modo offline)
  static const ParametrosTopograficos porDefecto = ParametrosTopograficos(
    id: 1,
    zonaCiudad: 'El Alto - Topografía Compleja',
    costoBaseKm: 2.00,
    consumoLitrosKm: 0.100, // 10L/100km
    precioCombustibleBs: 6.96, // sin subvención, mayo 2026
    factorAltitud: 1.40,
    factorSuperficie: 2.50,
    costoMinutoDetencion: 0.50,
  );
}

// ─── Servicio de descarga de parámetros ──────────────────────────────────────
class ParametrosService {
  static const String _urlBase = 'http://192.168.0.9:3000'; // ⚠️ Cambia tu IP
  static const String _cacheKey = 'parametros_topograficos_v3';

  static Future<ParametrosTopograficos> obtener() async {
    try {
      final response = await http
          .get(Uri.parse('$_urlBase/api/parametros'))
          .timeout(const Duration(seconds: 5));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data != null) {
          final params = ParametrosTopograficos.fromJson(data);
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(_cacheKey, response.body);
          return params;
        }
      }
    } catch (_) {
      // Sin conexión — intentar caché
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      final cached = prefs.getString(_cacheKey);
      if (cached != null)
        return ParametrosTopograficos.fromJson(jsonDecode(cached));
    } catch (_) {}

    return ParametrosTopograficos.porDefecto;
  }
}

// ─── Fórmula tarifaria v3 ─────────────────────────────────────────────────────
//
//   T = D × (Cb + Cl × Pc) × FH × FR + Ct × Td
//
// Donde:
//   D   = distancia en km                        (GPS en tiempo real)
//   Cb  = costo base por km en Bs                (ganancia conductor + depreciación)
//   Cl  = consumo del vehículo en litros/km       (0.10 L/km para taxi pequeño)
//   Pc  = precio combustible en Bs/litro          (6.96 Bs sin subvención)
//   Cl × Pc = costo de gasolina por km            (0.696 Bs/km)
//   FH  = factor de altitud (4,100 msnm)          (1.40 — motor trabaja más)
//   FR  = factor de superficie                    (asfalto: 1.0 / tierra: 2.5)
//   Ct  = costo por minuto de detención en Bs     (tráfico, semáforos)
//   Td  = tiempo de detención en minutos          (GPS en tiempo real)
//
// El combustible se multiplica por FH × FR porque en terreno complicado
// y a gran altitud el motor consume proporcionalmente más gasolina.
//
double calcularTarifa({
  required double distanciaKm,
  required double costoBaseKm,
  required double consumoLitrosKm,
  required double precioCombustibleBs,
  required double factorAltitud,
  required double factorSuperficie,
  required double tiempoDetencionMin,
  required double costoMinutoDetencion,
}) {
  // Costo variable por km = Cb + Cl × Pc
  final costoVariableKm = costoBaseKm + (consumoLitrosKm * precioCombustibleBs);

  // Componente de recorrido: D × (Cb + Cl×Pc) × FH × FR
  final costoRecorrido =
      distanciaKm * costoVariableKm * factorAltitud * factorSuperficie;

  // Componente de detención: Ct × Td
  final costoDetencion = tiempoDetencionMin * costoMinutoDetencion;

  return costoRecorrido + costoDetencion;
}

// ─── Desglose detallado (útil para mostrar en pantalla o auditoría) ───────────
class DesgloseTarifa {
  final double distanciaKm;
  final double costoBaseKm;
  final double costoCombustibleKm;
  final double costoVariableKm;
  final double factorAltitud;
  final double factorSuperficie;
  final double costoRecorrido;
  final double tiempoDetencionMin;
  final double costoDetencion;
  final double tarifaTotal;
  final String tipoSuperficie;

  const DesgloseTarifa({
    required this.distanciaKm,
    required this.costoBaseKm,
    required this.costoCombustibleKm,
    required this.costoVariableKm,
    required this.factorAltitud,
    required this.factorSuperficie,
    required this.costoRecorrido,
    required this.tiempoDetencionMin,
    required this.costoDetencion,
    required this.tarifaTotal,
    required this.tipoSuperficie,
  });

  static DesgloseTarifa calcular({
    required ParametrosTopograficos params,
    required double distanciaKm,
    required double tiempoDetencionMin,
    required double factorSuperficie,
    required String tipoSuperficie,
  }) {
    final costoCombustibleKm =
        params.consumoLitrosKm * params.precioCombustibleBs;
    final costoVariableKm = params.costoBaseKm + costoCombustibleKm;
    final costoRecorrido =
        distanciaKm * costoVariableKm * params.factorAltitud * factorSuperficie;
    final costoDetencion = tiempoDetencionMin * params.costoMinutoDetencion;

    return DesgloseTarifa(
      distanciaKm: distanciaKm,
      costoBaseKm: params.costoBaseKm,
      costoCombustibleKm: costoCombustibleKm,
      costoVariableKm: costoVariableKm,
      factorAltitud: params.factorAltitud,
      factorSuperficie: factorSuperficie,
      costoRecorrido: costoRecorrido,
      tiempoDetencionMin: tiempoDetencionMin,
      costoDetencion: costoDetencion,
      tarifaTotal: costoRecorrido + costoDetencion,
      tipoSuperficie: tipoSuperficie,
    );
  }

  @override
  String toString() =>
      'D=${distanciaKm.toStringAsFixed(3)}km × '
      '(Cb=$costoBaseKm + Cl×Pc=${costoCombustibleKm.toStringAsFixed(3)}) × '
      'FH=$factorAltitud × FR=$factorSuperficie + '
      'Ct=${costoDetencion.toStringAsFixed(2)} = '
      'Bs ${tarifaTotal.toStringAsFixed(2)}';
}
