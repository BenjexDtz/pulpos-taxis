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
  final double costoMinutoDetencion; // Ct — también la tarifa por hora del taxímetro (× 60)

  // Taxímetro (Directiva 2014/32/UE, Anexo IX)
  final double bajadaBandera; // B — importe inicial
  final double valorSalto; // S — el importe avanza de S en S
  final ModoTarifa modoTarifa;

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
    this.bajadaBandera = 0,
    this.valorSalto = 0.10,
    this.modoTarifa = ModoTarifa.s,
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
      bajadaBandera: double.parse((json['bajada_bandera_bs'] ?? 0).toString()),
      valorSalto: double.parse((json['valor_salto_bs'] ?? 0.10).toString()),
      modoTarifa: json['modo_tarifa'] == 'D' ? ModoTarifa.d : ModoTarifa.s,
    );
  }

  // Para guardar la copia del viaje en curso; fromJson la vuelve a leer
  Map<String, Object> toJson() => {
    'id': id,
    'zona_ciudad': zonaCiudad,
    'costo_base_km': costoBaseKm,
    'consumo_litros_km': consumoLitrosKm,
    'precio_combustible_bs': precioCombustibleBs,
    'factor_altitud': factorAltitud,
    'factor_superficie': factorSuperficie,
    'factor_empedrado': factorEmpedrado,
    'costo_minuto_detencion': costoMinutoDetencion,
    'bajada_bandera_bs': bajadaBandera,
    'valor_salto_bs': valorSalto,
    'modo_tarifa': modoTarifa.codigo,
  };

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
    bajadaBandera: 2.00,
    valorSalto: 0.50,
  );
}

// S: en cada tramo se cobra el tiempo o la distancia, lo que sea mayor; D: ambos a la vez
enum ModoTarifa {
  s('S'),
  d('D');

  const ModoTarifa(this.codigo);
  final String codigo;
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
}
