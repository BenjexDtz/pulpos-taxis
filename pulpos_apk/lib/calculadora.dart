import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';
import 'sesion.dart';

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
  final double factorEmpedrado; // FE para empedrado/adoquín
  final double costoMinutoDetencion;

  const ParametrosTopograficos({
    required this.id,
    required this.zonaCiudad,
    required this.costoBaseKm,
    required this.consumoLitrosKm,
    required this.precioCombustibleBs,
    required this.factorAltitud,
    required this.factorSuperficie,
    required this.factorEmpedrado,
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
      factorEmpedrado: double.parse(
        (json['factor_empedrado'] ?? 1.50).toString(),
      ),
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
    factorEmpedrado: 2.00,
    costoMinutoDetencion: 0.50,
  );
}

// ─── Servicio de descarga de parámetros ──────────────────────────────────────
class ParametrosService {
  static String _cacheKey(String? codigoEmpresa) => 'parametros_${codigoEmpresa ?? 'sin_empresa'}';

  static Future<ParametrosTopograficos> obtener() async {
    final token = await Sesion.tokenValido();
    final codigo = (await Sesion.empresa())?.codigo;

    if (token != null) {
      try {
        final response = await http
            .get(
              Uri.parse('$urlServidor/api/config'),
              headers: {'Authorization': 'Bearer $token'},
            )
            .timeout(const Duration(seconds: 5));

        if (response.statusCode == 200) {
          final data = jsonDecode(response.body);
          final params = ParametrosTopograficos.fromJson(data['parametros']);
          final empresa = EmpresaActual.fromJson(data['empresa']);
          await Sesion.guardarEmpresa(empresa);
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(_cacheKey(empresa.codigo), jsonEncode(data['parametros']));
          return params;
        }
      } catch (_) {
        // Sin conexión — intentar caché
      }
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      final cached = prefs.getString(_cacheKey(codigo));
      if (cached != null) {
        return ParametrosTopograficos.fromJson(jsonDecode(cached));
      }
    } catch (_) {}

    return ParametrosTopograficos.porDefecto;
  }
}

// ─── Fórmula tarifaria v4 ─────────────────────────────────────────────────────
//
//   T = (Da + Dt × FR + De × FE) × (Cb + Cl × Pc) × FH + Ct × Td
//
// Donde:
//   Da  = km recorridos en asfalto               (GPS, por tramos)
//   Dt  = km recorridos en tierra/barro          (GPS, por tramos)
//   De  = km recorridos en empedrado/adoquín     (GPS, por tramos)
//   Cb  = costo base por km en Bs                (ganancia conductor + depreciación)
//   Cl  = consumo del vehículo en litros/km       (0.10 L/km para taxi pequeño)
//   Pc  = precio combustible en Bs/litro          (6.96 Bs sin subvención)
//   FH  = factor de altitud (4,100 msnm)          (1.40 — motor trabaja más)
//   FR  = factor de superficie de la tierra       (2.5; el asfalto vale 1.0)
//   FE  = factor de superficie del empedrado      (2.0)
//   Ct  = costo por minuto de detención en Bs     (tráfico, semáforos)
//   Td  = tiempo de detención en minutos          (GPS en tiempo real)
//
// Con un solo tipo de superficie se reduce a la v3: D × (Cb + Cl × Pc) × FH × FR + Ct × Td.
//
double calcularTarifa({
  required double kmAsfalto,
  required double kmTierra,
  double kmEmpedrado = 0,
  required double costoBaseKm,
  required double consumoLitrosKm,
  required double precioCombustibleBs,
  required double factorAltitud,
  required double factorSuperficie,
  double factorEmpedrado = 1,
  required double tiempoDetencionMin,
  required double costoMinutoDetencion,
}) {
  final costoVariableKm = costoBaseKm + (consumoLitrosKm * precioCombustibleBs);
  final kmPonderados =
      kmAsfalto + kmTierra * factorSuperficie + kmEmpedrado * factorEmpedrado;
  final costoRecorrido = kmPonderados * costoVariableKm * factorAltitud;
  final costoDetencion = tiempoDetencionMin * costoMinutoDetencion;
  return costoRecorrido + costoDetencion;
}

// El índice es el código que viaja al servidor: no cambiar el orden
enum Superficie { asfalto, tierra, empedrado }

// Cada tramo GPS se suma a la superficie elegida cuando llega la posición
class RecorridoPorSuperficie {
  final _km = {for (final s in Superficie.values) s: 0.0};

  double kmPor(Superficie s) => _km[s]!;
  double get kmAsfalto => _km[Superficie.asfalto]!;
  double get kmTierra => _km[Superficie.tierra]!;
  double get kmEmpedrado => _km[Superficie.empedrado]!;
  double get kmTotal => kmAsfalto + kmTierra + kmEmpedrado;

  String get tipo {
    final usadas = Superficie.values.where((s) => _km[s]! > 0).toList();
    if (usadas.length > 1) return 'mixto';
    return usadas.isEmpty ? 'asfalto' : usadas.first.name;
  }

  void sumar(double km, Superficie superficie) => _km[superficie] = _km[superficie]! + km;

  double tarifa(ParametrosTopograficos p, double tiempoDetencionMin) =>
      calcularTarifa(
        kmAsfalto: kmAsfalto,
        kmTierra: kmTierra,
        kmEmpedrado: kmEmpedrado,
        costoBaseKm: p.costoBaseKm,
        consumoLitrosKm: p.consumoLitrosKm,
        precioCombustibleBs: p.precioCombustibleBs,
        factorAltitud: p.factorAltitud,
        factorSuperficie: p.factorSuperficie,
        factorEmpedrado: p.factorEmpedrado,
        tiempoDetencionMin: tiempoDetencionMin,
        costoMinutoDetencion: p.costoMinutoDetencion,
      );
}
